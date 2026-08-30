import { plural } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { AtIcon } from '@phosphor-icons/react'
import { composeRefs } from '@radix-ui/react-compose-refs'
import { clsx } from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { HandleString, isValidHandle } from '@atproto/syntax'
import { useStableCallback } from '#/hooks/use-stable-callback.ts'
import {
  MAX_FULL_LENGTH,
  MAX_LENGTH,
  MIN_LENGTH,
  ValidDomain,
  isValidDomain,
} from '#/lib/handle.ts'
import { Override } from '#/lib/util.ts'
import { InputText, InputTextProps } from './input-text.tsx'

export type InputHandleProvidedProps = Override<
  Omit<
    InputTextProps,
    | 'type'
    | 'value'
    | 'defaultValue'
    | 'onChange'
    | 'append'
    | 'bellow'
    | 'pattern'
    | 'minLength'
    | 'maxLength'
  >,
  {
    /** Initial handle, used to seed the segment + selected domain. */
    handle?: HandleString
    /** Called whenever the current handle becomes valid or invalid. */
    onHandle?: (handle: HandleString | undefined) => void
    /** List of available domains for the handle */
    domains: string[]
  }
>

export function InputHandleDefault({
  domains: availableDomains,
  handle: handleInit,
  onHandle,

  // InputTextProps
  autoCapitalize = 'none',
  autoComplete = 'off',
  autoCorrect = 'off',
  dir = 'auto',
  icon = <AtIcon aria-hidden weight="bold" className="size-5" />,
  ref,
  title,
  ...props
}: InputHandleProvidedProps) {
  const { t } = useLingui()
  const domains = availableDomains.filter(isValidDomain)

  const inputRef = useRef<HTMLInputElement>(null)

  const [domainIdx, setDomainIdx] = useState(() => {
    if (!handleInit) return 0
    const idx = domains.findIndex((d) => handleInit.endsWith(d))
    return idx === -1 ? 0 : idx
  })
  const [segment, setSegment] = useState(() => {
    if (!handleInit) return ''
    const domain = domains[domainIdx]
    return handleInit.endsWith(domain)
      ? handleInit.slice(0, -domain.length)
      : ''
  })

  const domain: ValidDomain | null = domains[domainIdx] || domains[0] || null

  const { minLength, maxLength, validateSegment } = useSegmentValidator(domain)

  const [, setHandle] = useState<HandleString | undefined>(handleInit)
  const [validity, setValidity] = useState(() => validateSegment(segment))

  const update = useStableCallback((segment: string, domainIdx: number) => {
    const validity = validateSegment(segment)
    const domain = domains[domainIdx]
    const handle = domain && validity.valid && `${segment}${domain}`

    setSegment(segment)
    setValidity(validity)
    setDomainIdx(domainIdx)

    if (handle && isValidHandle(handle)) {
      setHandle(handle)
      onHandle?.(handle)
    } else {
      setHandle(undefined)
      onHandle?.(undefined)
    }
  })

  // Automatically update the domain index when the list length changes
  useEffect(() => {
    if (domainIdx >= domains.length) update(segment, 0)
  }, [update, segment, domains.length, domainIdx])

  // Stand in for the segment before anything is typed, so the preview can
  // show a whole handle from the start rather than a gap or a grey bar.
  const exampleSegment = t`yourname`

  const valid = validity.validLength && validity.validCharset

  // @NOTE The conditional below is placeholder {0} of this Trans block, and
  // the msgid it produces is the one the catalogs already carry. Do not add or
  // reorder elements inside it.
  const preview = (
    <Trans>
      Your full username will be:{' '}
      {segment ? (
        <span className="text-text-default block break-all font-medium">
          @{segment}
          {domain}
        </span>
      ) : (
        <span className="block break-all">
          @{exampleSegment}
          {domain}
        </span>
      )}
    </Trans>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex items-center">
        <span
          aria-hidden
          className="text-text-light absolute left-3 flex items-center justify-center"
        >
          {icon}
        </span>

        <InputText
          {...props}
          ref={composeRefs(ref, inputRef)}
          title={title ?? t`Type your username`}
          placeholder={exampleSegment}
          type="text"
          pattern="[a-z0-9][a-z0-9\-]+[a-z0-9]"
          minLength={minLength}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoCorrect={autoCorrect}
          dir={dir}
          value={segment}
          onChange={(event) => {
            const value = event.target.value.toLowerCase()

            // Ensure the input is always lowercase
            const selectionStart = event.target.selectionStart
            const selectionEnd = event.target.selectionEnd
            event.target.value = value
            event.target.setSelectionRange(selectionStart, selectionEnd)

            update(value, domainIdx)
          }}
          className="pl-10"
        />
      </div>

      {/* @NOTE One line stating both rules, always rendered, so the row height
        never changes under the cursor mid-click — only its colour does. */}
      <p
        className={clsx(
          'text-xs',
          !segment || valid ? 'text-text-light' : 'text-error',
        )}
      >
        {/* @NOTE The noun agrees with the end of the range, so the plural is
          driven by `maxLength`. Locales with more than two plural categories
          need the form even though the count is never one here. */}
        {t`Use ${minLength}–${plural(maxLength, {
          one: '# letter, number or hyphen',
          other: '# letters, numbers or hyphens',
        })}`}
      </p>

      {domains.length > 1 ? (
        <>
          <div
            className="flex flex-col gap-2"
            role="radiogroup"
            aria-label={t`Select domain`}
          >
            {domains.map((d) => (
              <label
                key={d}
                htmlFor={`domain-${d}`}
                className={clsx(
                  'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                  'focus-within:ring-primary focus-within:ring-2',
                  d === domain
                    ? 'border-primary bg-primary/5'
                    : 'border-contrast-50 hover:bg-contrast-0',
                )}
              >
                <input
                  type="radio"
                  id={`domain-${d}`}
                  name="domain"
                  value={d}
                  checked={d === domain}
                  onChange={() => {
                    const idx = domains.indexOf(d)
                    if (idx !== -1) update(segment, idx)
                  }}
                  className="accent-primary size-4"
                />
                <span className="text-sm font-medium">{d}</span>
              </label>
            ))}
          </div>

          <p className="text-text-light mt-1 text-sm">{preview}</p>
        </>
      ) : (
        <>
          <input type="hidden" name="domain" value={domain ?? ''} />

          {/* @NOTE With no choice to make, the preview is the only thing
            showing the domain at all, so it gets a surface of its own rather
            than sitting as one more line of grey copy. */}
          <p className="bg-contrast-0 text-text-light mt-1 rounded-lg px-3 py-2.5 text-sm">
            {preview}
          </p>
        </>
      )}
    </div>
  )
}

function useSegmentValidator(domain: ValidDomain | null) {
  const minLen = MIN_LENGTH
  const maxLen = domain
    ? Math.min(MAX_LENGTH, MAX_FULL_LENGTH - domain.length)
    : MAX_LENGTH

  const validateSegment = useCallback(
    (segment: string) => {
      const validLength = segment.length >= minLen && segment.length <= maxLen
      const validCharset = /^[a-z0-9][a-z0-9-]+[a-z0-9]$/.test(segment)

      return { validLength, validCharset, valid: validLength && validCharset }
    },
    [maxLen, minLen],
  )

  return {
    minLength: minLen,
    maxLength: maxLen,
    validateSegment,
  }
}
