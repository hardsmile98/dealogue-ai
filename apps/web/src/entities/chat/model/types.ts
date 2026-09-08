import type { ChatDto, ChatPeerDto, MessageDirection, MessageDto } from '@/shared/api'

export type Chat = ChatDto
export type ChatPeer = ChatPeerDto
export type Message = MessageDto
export type { MessageDirection }

export interface MessagesQuery {
  accountId: string
  chatId: string
}
