import EligibilityWizard from '@/components/EligibilityWizard'

export const metadata = {
  title: 'Check eligibility',
  description:
    'Answer four short sets of questions and see every central and state scheme you qualify for.',
}

export default function EligibilityPage() {
  return <EligibilityWizard />
}
