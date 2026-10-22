import { act, render, screen } from '@testing-library/react'
import { ToastProvider } from '../ToastContext'
import { useToast } from '../toastHooks'

function Trigger() {
  const toast = useToast()
  return <button onClick={() => toast.success('ok')}>notify</button>
}

describe('ToastContext', () => {
  afterEach(() => {
    delete document.fullscreenElement
  })

  it('portals toasts into document.fullscreenElement after a fullscreenchange', () => {
    const fullscreenRoot = document.createElement('div')
    document.body.appendChild(fullscreenRoot)

    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    )

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: fullscreenRoot,
    })
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    act(() => {
      screen.getByRole('button', { name: 'notify' }).click()
    })

    const toast = screen.getByText('ok')
    expect(fullscreenRoot).toContainElement(toast)

    fullscreenRoot.remove()
  })
})
