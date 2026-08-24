import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MiniMaxVoice } from './index';

describe('MiniMaxVoice', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends documented speech fields to the regional endpoint and decodes audio', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { audio: Buffer.from('audio').toString('hex'), status: 2 },
          base_resp: { status_code: 0 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const voice = new MiniMaxVoice({
      speechModel: { apiKey: 'test-key', region: 'cn_zh', name: 'speech-2.8-turbo' },
      speaker: 'voice-1',
    });

    const stream = await voice.speak(Readable.from(['hello']), {
      output_format: 'wav',
      language_boost: 'English',
      audio_setting: { format: 'wav' },
    });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('audio');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.minimaxi.com/v1/t2a_v2',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        body: expect.stringContaining('"model":"speech-2.8-turbo"'),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      text: 'hello',
      output_format: 'wav',
      language_boost: 'English',
      voice_setting: { voice_id: 'voice-1' },
    });
  });

  it('rejects unsuccessful responses and empty input', async () => {
    const voice = new MiniMaxVoice({ speechModel: { apiKey: 'test-key' } });
    await expect(voice.speak('   ')).rejects.toThrow('Input text is empty');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ base_resp: { status_code: 1001, status_msg: 'bad request' } }), { status: 400 }),
    );
    await expect(voice.speak('hello')).rejects.toThrow('bad request');
  });
});
