import type { AgentEvent, UserProfile, ChatMessage } from '@/lib/types'
import type { SessionState } from '@/lib/store'
import type { Content, Part } from '@/lib/gemini'
import { GeminiError, geminiLive, generate } from '@/lib/gemini'
import { SarvamError, sarvamLive, translate } from '@/lib/sarvam'
import { TOOL_DECLARATIONS, TOOL_MAP, runTool } from '@/lib/agent/tools'
import { CATALOGUE_SIZE } from '@/lib/agent/tools'
import { getLanguage } from '@/lib/data/languages'
import { STATE_NAMES } from '@/lib/data/states'
import { searchSchemes } from '@/lib/data/schemes'
import {
  FIELD_LABELS,
  matchSchemes,
  nextBestQuestion,
  OCCUPATION_LABELS,
} from '@/lib/eligibility'
import { formatINR, truncate } from '@/lib/utils'

const MAX_STEPS = 6

/* -------------------------------------------------------------------------- */
/*  System prompt                                                              */
/* -------------------------------------------------------------------------- */

function systemPrompt(session: SessionState, language: string): string {
  const lang = getLanguage(language)
  const profileLines = Object.entries(session.profile)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n')

  const vault = session.documents.length
    ? session.documents.map((d) => `${d.name} (${d.canonicalId})`).join(', ')
    : 'empty'

  const apps = session.applications.length
    ? session.applications
        .map((a) => `${a.schemeName} [${a.status}]${a.referenceNo ? ` ref ${a.referenceNo}` : ''}`)
        .join('; ')
    : 'none'

  return `You are YojanaMitra, an AI saathi that helps citizens of India discover and apply for government welfare schemes.

CATALOGUE
- ${CATALOGUE_SIZE} schemes are loaded: central schemes plus at least one scheme for every state and union territory.
- You have tools. The catalogue, eligibility rules and documents all live behind those tools. Never answer a factual question about a scheme from memory — call a tool.

CITIZEN CONTEXT (already on record, do not ask again)
- Preferred language: ${lang.name} (${lang.code})
- Profile:
${profileLines || '  - nothing yet'}
- DigiLocker: ${session.digilocker.connected ? `connected via ${session.digilocker.method}` : 'not connected'}
- Documents in vault: ${vault}
- Applications: ${apps}

HOW TO RESPOND
- Reply in ${lang.name}. If ${lang.name} is not English, write the entire answer in ${lang.name} using its native script, not transliterated English.
- Be warm and plain-spoken. Many citizens are first-time internet users. Avoid jargon and bureaucratic phrasing.
- Be brief: two or three short sentences, then a bullet list where it helps. No headings, no long essays.
- Use ₹ amounts and concrete next steps.
- Ask at most two questions in one message.

RULES YOU MUST FOLLOW
1. Never invent a scheme, benefit amount, eligibility rule, document or deadline. Only state what a tool returned.
2. Never state that an application has been submitted unless the submit_application tool returned ok:true. If it did not, say the application is prepared and awaiting confirmation.
3. Before calling fetch_digilocker_documents, explain that you will read their DigiLocker and ask for permission. Only then call it with consented=true.
4. Before calling submit_application, list exactly which scheme, which documents and which key form values will be submitted, and ask the citizen to confirm. Only then call it with confirm=true.
5. If the citizen is not eligible for a scheme, say so plainly and immediately offer an alternative that they might qualify for.
6. Record every new fact the citizen shares with update_profile, so the next answer is better.
7. When the citizen tells you their situation, call check_eligibility (without scheme_id) to rank real matches before recommending anything.

TOOL ORDER THAT USUALLY WORKS
1. update_profile with anything the citizen just said.
2. check_eligibility to rank matches (or search_schemes for a topic).
3. get_scheme_details for the one scheme you are recommending.
4. fetch_digilocker_documents (after consent) and start_application if they want to apply.
5. autofill_application, then summarise and ask for confirmation before submit_application.`
}

/* -------------------------------------------------------------------------- */
/*  Gemini path                                                                */
/* -------------------------------------------------------------------------- */

function toContents(history: ChatMessage[], message: string): Content[] {
  const contents: Content[] = []
  for (const entry of history.slice(-8)) {
    contents.push({
      role: entry.role === 'user' ? 'user' : 'model',
      parts: [{ text: entry.content }],
    })
  }
  contents.push({ role: 'user', parts: [{ text: message }] })
  return contents
}

async function runGemini(
  session: SessionState,
  message: string,
  language: string,
  history: ChatMessage[],
  onEvent: (event: AgentEvent) => void,
): Promise<string> {
  const contents = toContents(history, message)
  let finalText = ''
  let step = 0

  onEvent({ type: 'status', message: 'Understanding your situation…' })

  while (step < MAX_STEPS) {
    step += 1

    const result = await generate({
      systemInstruction: systemPrompt(session, language),
      contents,
      tools: TOOL_DECLARATIONS,
      temperature: 0.35,
    })

    session.usage.geminiCalls += 1

    if (result.text.trim()) {
      finalText = finalText ? `${finalText}\n\n${result.text}` : result.text
    }

    if (result.functionCalls.length === 0) {
      // Final answer turn.
      break
    }

    contents.push({ role: 'model', parts: result.parts })

    const responseParts: Part[] = []
    for (const call of result.functionCalls) {
      const tool = TOOL_MAP[call.name]
      const label = tool?.label ?? call.name
      const id = `${call.name}_${step}_${Math.random().toString(36).slice(2, 7)}`

      onEvent({ type: 'tool', id, name: call.name, label, args: call.args })

      const toolResult = await runTool(call.name, call.args, { session })

      onEvent({
        type: 'tool_result',
        id,
        name: call.name,
        ok: toolResult.ok,
        summary: toolResult.summary,
        data: undefined,
      })

      // Surface structured side effects to the UI immediately.
      if (call.name === 'update_profile' || call.name === 'fetch_digilocker_documents') {
        onEvent({ type: 'profile', profile: session.profile })
      }
      if (
        call.name === 'start_application' ||
        call.name === 'autofill_application' ||
        call.name === 'submit_application'
      ) {
        const appId = String(toolResult.data?.applicationId ?? '')
        const application = session.applications.find((a) => a.id === appId)
        if (application) onEvent({ type: 'application', application })
      }
      if (call.name === 'search_schemes' || call.name === 'check_eligibility') {
        const ids = extractSchemeIds(toolResult.data)
        if (ids.length) onEvent({ type: 'schemes', schemes: ids })
      }

      responseParts.push({
        functionResponse: {
          name: call.name,
          response: {
            ok: toolResult.ok,
            result: toolResult.summary,
            ...(toolResult.data ?? {}),
          },
        },
      })
    }

    contents.push({ role: 'user', parts: responseParts })
  }

  if (!finalText.trim()) {
    finalText =
      'I have updated your details and prepared everything I can. Ask me to continue whenever you are ready.'
  }

  // Emit the answer in small pieces so the UI renders it progressively.
  for (const chunk of chunkForDisplay(finalText)) {
    onEvent({ type: 'text', delta: chunk })
  }

  return finalText
}

function extractSchemeIds(data?: Record<string, unknown>): string[] {
  if (!data) return []
  const schemes = data.schemes as Array<{ id?: string }> | undefined
  if (Array.isArray(schemes)) {
    return schemes.map((s) => s.id).filter((id): id is string => Boolean(id))
  }
  const matches = data.matches as Array<{ schemeId?: string }> | undefined
  if (Array.isArray(matches)) {
    return matches
      .map((m) => m.schemeId)
      .filter((id): id is string => Boolean(id))
  }
  if (typeof data.schemeId === 'string') return [data.schemeId]
  return []
}

function chunkForDisplay(text: string): string[] {
  const words = text.split(/(\s+)/)
  const chunks: string[] = []
  let current = ''
  for (const word of words) {
    current += word
    if (current.length >= 24) {
      chunks.push(current)
      current = ''
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/* -------------------------------------------------------------------------- */
/*  Local fallback engine                                                      */
/* -------------------------------------------------------------------------- */

const STATE_LOOKUP = new Map(STATE_NAMES.map((s) => [s.toLowerCase(), s]))

const OCCUPATION_HINTS: Array<[RegExp, UserProfile['occupation']]> = [
  [/\b(farmer|farming|kisan|kheti|agricultur|rythu|raitu)\b/i, 'farmer'],
  [/\b(agricultural labou?rer|farm labou?rer|khet mazdoor)\b/i, 'agricultural_labour'],
  [/\b(student|studying|college|school|padh|vidyarthi|scholar)\b/i, 'student'],
  [/\b(street vendor|hawker|rehdi|patri|thela)\b/i, 'street_vendor'],
  [/\b(artisan|craftsman|weaver|potter|carpenter|blacksmith|tailor|vishwakarma)\b/i, 'artisan'],
  [/\b(business|shop|dukan|trader|self[- ]employed|entrepreneur)\b/i, 'business'],
  [/\b(salaried|employee|job|naukri)\b/i, 'salaried'],
  [/\b(unemployed|no work|jobless|berozgar)\b/i, 'unemployed'],
  [/\b(homemaker|housewife|grihini)\b/i, 'homemaker'],
  [/\b(retired|pensioner)\b/i, 'retired'],
  [/\b(labourer|laborer|mazdoor|daily wage|worker)\b/i, 'labourer'],
]

/** Best-effort extraction of profile facts from free-text, in any language. */
export function extractProfileHints(message: string): UserProfile {
  const hints: UserProfile = {}
  const text = message.toLowerCase()

  const ageMatch = text.match(/\b(\d{1,3})\s*(?:years?|yrs?|saal|varsh|वर्ष|साल)\b/i)
  if (ageMatch) {
    const age = Number(ageMatch[1])
    if (age > 0 && age < 120) hints.age = age
  }

  const incomeMatch = text.match(
    /(?:income|kamai|आय|earning|salary|आमदनी)[^\d]{0,20}([\d,]{4,12})/i,
  )
  const lakhMatch = text.match(/([\d.]+)\s*(?:lakh|lac|लाख)/i)
  if (incomeMatch) {
    const value = Number(incomeMatch[1].replace(/,/g, ''))
    if (value >= 1000) hints.annualIncome = value
  } else if (lakhMatch) {
    const lakhs = Number(lakhMatch[1])
    if (lakhs > 0 && lakhs < 100) hints.annualIncome = Math.round(lakhs * 100000)
  }

  for (const [name, canonical] of STATE_LOOKUP) {
    if (text.includes(name)) {
      hints.state = canonical
      break
    }
  }

  if (/\b(female|woman|women|girl|mahila|aurat|महिला|स्त्री|ladki|beti)\b/i.test(text)) {
    hints.gender = 'female'
  } else if (/\b(male|man|men|purush|पुरुष|ladka|beta)\b/i.test(text)) {
    hints.gender = 'male'
  }

  if (/\b(sc|scheduled caste|dalit|अनुसूचित जाति)\b/i.test(text)) hints.caste = 'sc'
  else if (/\b(st|scheduled tribe|adivasi|आदिवासी|janjati)\b/i.test(text)) hints.caste = 'st'
  else if (/\b(obc|other backward)\b/i.test(text)) hints.caste = 'obc'
  else if (/\b(general category|savarna)\b/i.test(text)) hints.caste = 'general'

  for (const [pattern, occupation] of OCCUPATION_HINTS) {
    if (pattern.test(text)) {
      hints.occupation = occupation
      break
    }
  }

  if (/\b(village|rural|gaon|गाँव|गांव)\b/i.test(text)) hints.residence = 'rural'
  else if (/\b(city|urban|shehar|शहर)\b/i.test(text)) hints.residence = 'urban'

  if (/\b(widow|vidhwa|विधवा)\b/i.test(text)) hints.maritalStatus = 'widowed'
  else if (/\b(unmarried|single|kuwari)\b/i.test(text)) hints.maritalStatus = 'single'
  else if (/\b(married|shadi|विवाहित)\b/i.test(text)) hints.maritalStatus = 'married'

  if (/\b(disab|divyang|विकलांग|दिव्यांग|handicap)\b/i.test(text)) hints.disability = true
  if (/\b(bpl|below poverty|गरीबी रेखा|antyodaya|priority household)\b/i.test(text)) hints.bpl = true
  if (/\b(ration card|राशन कार्ड)\b/i.test(text)) hints.hasRationCard = true
  if (/\b(bank account|बैंक खाता|jan dhan)\b/i.test(text)) hints.hasBankAccount = true

  return hints
}

function applyHints(profile: UserProfile, hints: UserProfile): string[] {
  const learned: string[] = []
  for (const key of Object.keys(hints) as Array<keyof UserProfile>) {
    const value = hints[key]
    if (value === undefined || profile[key] === value) continue
    // What the citizen says out loud wins over anything inferred earlier,
    // including values pre-filled from DigiLocker documents — otherwise a
    // correction ("actually I live in Bihar") could never take effect.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(profile as any)[key] = value
    learned.push(FIELD_LABELS[key as keyof typeof FIELD_LABELS] ?? String(key))
  }
  return learned
}

interface LocalAnswerOptions {
  session: SessionState
  message: string
  language: string
  /** Profile fields this message already changed (see `applyHints`). */
  learned: string[]
}

interface LocalAnswer {
  answer: string
}

async function localAnswer(options: LocalAnswerOptions): Promise<LocalAnswer> {
  const { session, message, language, learned } = options
  const profile = session.profile

  let matches = matchSchemes(profile, { limit: 4 })
  const searched = searchSchemes({
    text: message.replace(/[?।.,!]/g, ' '),
    state: profile.state,
    limit: 5,
  })

  const hasAsk = /\b(scheme|yojana|योजना|apply|आवेदन|benefit|help|madad|paisa|money|loan|scholarship|pension)\b/i.test(
    message,
  )

  const lines: string[] = []

  if (profile.name) lines.push(`Namaste ${profile.name}!`)
  else lines.push('Namaste!')

  if (learned.length > 0) {
    lines.push(`I noted your ${learned.join(', ').toLowerCase()}.`)
  }

  if (matches.length === 0 && searched.length === 0) {
    lines.push(
      'Tell me a little about yourself — your state, age, occupation and yearly family income — and I will find the schemes you qualify for.',
    )
    return { answer: lines.join('\n') }
  }

  if (matches.length > 0 && (hasAsk || learned.length > 0 || Object.keys(profile).length >= 3)) {
    lines.push('Based on what I know about you, these schemes fit best:')
    for (const match of matches) {
      const scheme = match.scheme
      const verdict =
        match.result.verdict === 'eligible'
          ? 'you appear eligible'
          : match.result.verdict === 'likely'
            ? 'likely eligible'
            : 'need a couple more details'
      const blocked = match.result.failed.length
        ? ` (blocked by: ${match.result.failed.map((f) => f.criterion.label).join('; ')})`
        : ''
      lines.push(
        `• ${scheme.name} — ${verdict}${scheme.state ? ` · ${scheme.state}` : ' · All India'}\n  ${truncate(scheme.summary, 150)}\n  ${scheme.benefits[0]}${blocked}`,
      )
    }
  } else {
    lines.push('Here is what I found in the scheme catalogue:')
    for (const scheme of searched.slice(0, 4)) {
      lines.push(
        `• ${scheme.name} — ${truncate(scheme.summary, 150)}${scheme.state ? ` · ${scheme.state}` : ' · All India'}`,
      )
    }
  }

  const next = nextBestQuestion(profile)
  if (next) {
    lines.push(
      `Next: tell me your ${FIELD_LABELS[next].toLowerCase()} and I can widen the search.`,
    )
  } else {
    lines.push(
      'I can now check your documents on DigiLocker and start an application for you.',
    )
  }

  if (profile.annualIncome !== undefined) {
    lines.push(`(Noted income: ${formatINR(profile.annualIncome)} per year.)`)
  }
  if (profile.occupation) {
    lines.push(`(Noted occupation: ${OCCUPATION_LABELS[profile.occupation] ?? profile.occupation}.)`)
  }

  return { answer: lines.join('\n') }
}

async function runLocal(
  session: SessionState,
  message: string,
  language: string,
  onEvent: (event: AgentEvent) => void,
): Promise<string> {
  onEvent({ type: 'status', message: 'Reading your message…' })

  const hints = extractProfileHints(message)
  const learned = applyHints(session.profile, hints)

  if (Object.keys(hints).length > 0) {
    onEvent({
      type: 'tool',
      id: 'local_profile',
      name: 'update_profile',
      label: 'Noting details from your message',
      args: hints as Record<string, unknown>,
    })
  }

  let answer = (await localAnswer({ session, message, language, learned })).answer

  if (Object.keys(hints).length > 0) {
    onEvent({
      type: 'tool_result',
      id: 'local_profile',
      name: 'update_profile',
      ok: learned.length > 0,
      summary:
        learned.length > 0
          ? `Noted ${learned.length} detail${learned.length === 1 ? '' : 's'}: ${learned.join(', ')}`
          : 'No new details to save',
    })
    onEvent({ type: 'profile', profile: session.profile })
  }

  if (language && language !== 'en-IN' && sarvamLive()) {
    try {
      onEvent({ type: 'status', message: `Translating into ${getLanguage(language).name}…` })
      answer = await translate(answer, {
        sourceLanguage: 'en-IN',
        targetLanguage: language,
      })
      session.usage.sarvamCalls += 1
    } catch (error) {
      if (error instanceof SarvamError) {
        console.warn('[agent] local translation failed:', error.message)
      }
    }
  }

  for (const chunk of chunkForDisplay(answer)) {
    onEvent({ type: 'text', delta: chunk })
  }

  return answer
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                                */
/* -------------------------------------------------------------------------- */

export interface RunAgentOptions {
  session: SessionState
  message: string
  language: string
  history?: ChatMessage[]
  onEvent?: (event: AgentEvent) => void
}

export interface RunAgentResult {
  reply: string
  engine: 'gemini' | 'local'
}

export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  const { session, message, language, history = [], onEvent = () => {} } = options

  if (geminiLive()) {
    try {
      const reply = await runGemini(session, message, language, history, onEvent)
      onEvent({ type: 'done', engine: 'gemini' })
      return { reply, engine: 'gemini' }
    } catch (error) {
      const reason =
        error instanceof GeminiError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error)
      console.error('[agent] Gemini path failed, falling back to local engine:', reason)
      onEvent({
        type: 'status',
        message: 'The AI service is unavailable, so I am using the built-in assistant.',
      })
    }
  }

  const reply = await runLocal(session, message, language, onEvent)
  onEvent({ type: 'done', engine: 'local' })
  return { reply, engine: 'local' }
}
