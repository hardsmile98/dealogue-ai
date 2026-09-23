import { describe, expect, it } from 'vitest';
import type { Api } from 'teleproto';
import {
  describeMedia,
  displayNameOf,
  isNonHumanUser,
  mediaKindOf,
  messageText,
  onlyMessages,
  peerFieldsOf,
  privateUserOf,
} from './telegram-objects.js';

function user(fields: Record<string, unknown>): Api.User {
  return { className: 'User', id: { toString: () => '100' }, ...fields } as unknown as Api.User;
}

function documentMedia(attributes: Record<string, unknown>[]): Api.TypeMessageMedia {
  return {
    className: 'MessageMediaDocument',
    document: { className: 'Document', attributes },
  } as unknown as Api.TypeMessageMedia;
}

describe('собеседник', () => {
  it('имя: «Имя Фамилия», иначе @username, иначе телефон', () => {
    expect(displayNameOf(user({ firstName: 'Анна', lastName: 'Ли' }))).toBe('Анна Ли');
    expect(displayNameOf(user({ username: 'anna' }))).toBe('@anna');
    expect(displayNameOf(user({ phone: '79990001122' }))).toBe('+79990001122');
    expect(displayNameOf(user({}))).toBe('Пользователь 100');
  });

  it('поля чата берутся из пользователя, access hash — строкой', () => {
    const fields = peerFieldsOf(
      user({ firstName: 'Анна', username: 'anna', phone: '7999', accessHash: { toString: () => '-42' } }),
    );
    expect(fields).toEqual({
      peerId: '100',
      peerName: 'Анна',
      peerUsername: 'anna',
      peerPhone: '+7999',
      peerAccessHash: '-42',
    });
  });

  it('боты, «Избранное» и служебные аккаунты — не собеседники', () => {
    expect(isNonHumanUser(user({ bot: true }))).toBe(true);
    expect(isNonHumanUser(user({ self: true }))).toBe(true);
    expect(isNonHumanUser({ ...user({}), id: { toString: () => '777000' } } as Api.User)).toBe(true);
    expect(isNonHumanUser(user({}))).toBe(false);
  });

  it('из диалогов берутся только личные чаты с людьми', () => {
    expect(privateUserOf({ isUser: true, entity: user({}) })).not.toBeNull();
    expect(privateUserOf({ isUser: false, entity: user({}) })).toBeNull();
    expect(privateUserOf({ isUser: true, entity: user({ bot: true }) })).toBeNull();
    expect(privateUserOf({ isUser: true, entity: { className: 'Channel' } })).toBeNull();
  });
});

describe('сообщение', () => {
  it('различает виды вложений', () => {
    expect(mediaKindOf(undefined)).toBeNull();
    expect(mediaKindOf({ className: 'MessageMediaWebPage' } as Api.TypeMessageMedia)).toBeNull();
    expect(mediaKindOf({ className: 'MessageMediaPhoto' } as Api.TypeMessageMedia)).toBe('photo');
    expect(mediaKindOf(documentMedia([{ className: 'DocumentAttributeAudio', voice: true }]))).toBe('voice');
    expect(mediaKindOf(documentMedia([{ className: 'DocumentAttributeVideo', roundMessage: true }]))).toBe('video_note');
    expect(mediaKindOf(documentMedia([{ className: 'DocumentAttributeSticker' }]))).toBe('sticker');
    expect(mediaKindOf(documentMedia([]))).toBe('document');
    expect(mediaKindOf({ className: 'MessageMediaDice' } as Api.TypeMessageMedia)).toBe('other');
  });

  it('текст без подписи заменяется описанием вложения', () => {
    const voice = { message: '  ', media: documentMedia([{ className: 'DocumentAttributeAudio', voice: true }]) };
    expect(messageText(voice as unknown as Api.Message)).toBe('[Голосовое сообщение]');
    expect(messageText({ message: ' привет ' } as unknown as Api.Message)).toBe('привет');
    expect(describeMedia({ className: 'MessageMediaGeoLive' } as Api.TypeMessageMedia)).toBe('[Геопозиция]');
  });

  it('сервисные сообщения отбрасываются', () => {
    const items = [
      { className: 'Message', id: 1 },
      { className: 'MessageService', id: 2 },
      undefined,
    ] as unknown as Api.TypeMessage[];
    expect(onlyMessages(items).map((item) => item.id)).toEqual([1]);
  });
});
