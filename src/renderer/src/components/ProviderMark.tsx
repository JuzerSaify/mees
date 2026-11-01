import claudeIcon from '../assets/providers/claude.png'
import deepseekIcon from '../assets/providers/deepseek.png'
import geminiIcon from '../assets/providers/gemini.png'
import openaiIcon from '../assets/providers/openai.svg'
import opencodeIcon from '../assets/providers/opencode.svg'
import type { ProviderId } from '../../../shared/types'

interface ProviderMarkProps {
  provider: ProviderId
  size?: number
}

const icons: Record<ProviderId, string> = {
  openai: openaiIcon,
  anthropic: claudeIcon,
  google: geminiIcon,
  deepseek: deepseekIcon,
  codex: openaiIcon,
  opencode: opencodeIcon
}

export function ProviderMark({ provider, size = 18 }: ProviderMarkProps): React.JSX.Element {
  return (
    <img
      aria-hidden="true"
      className="provider-mark"
      draggable={false}
      height={size}
      src={icons[provider]}
      width={size}
    />
  )
}
