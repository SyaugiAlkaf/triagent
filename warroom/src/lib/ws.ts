import ReconnectingWebSocket from 'reconnecting-websocket'
import { useStore } from '@/store/store'
import type { WSEvent } from '@/types'

let socket: ReconnectingWebSocket | null = null

export function ensureSocket() {
  if (socket) return socket
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${proto}://${window.location.host}/ws`
  socket = new ReconnectingWebSocket(url, [], {
    minReconnectionDelay: 250,
    maxReconnectionDelay: 8000,
    connectionTimeout: 4000,
  })
  const store = useStore.getState()
  socket.addEventListener('open', () => store.setWsStatus('open'))
  socket.addEventListener('close', () => store.setWsStatus('closed'))
  socket.addEventListener('error', () => store.setWsStatus('closed'))
  socket.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(ev.data) as WSEvent
      useStore.getState().applyWsEvent(data)
    } catch (err) {
      console.error('ws parse error', err)
    }
  })
  return socket
}
