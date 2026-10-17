import Assistant from '@/components/Assistant'

export const metadata = {
  title: 'AI assistant',
  description:
    'Talk to the YojanaMitra assistant in your own language. It finds schemes, fetches documents from DigiLocker and applies on your behalf.',
}

export default function AssistantPage() {
  return <Assistant />
}
