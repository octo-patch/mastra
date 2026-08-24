import { PassThrough } from 'node:stream';

import { MastraVoice } from '@internal/voice';

export type MiniMaxRegion = 'global_en' | 'cn_zh';
export type MiniMaxSpeechModel =
  | 'speech-2.8-hd'
  | 'speech-2.8-turbo'
  | 'speech-2.6-hd'
  | 'speech-2.6-turbo'
  | 'speech-02-hd'
  | 'speech-02-turbo'
  | 'speech-01-hd'
  | 'speech-01-turbo';
export type MiniMaxAudioFormat = 'mp3' | 'wav' | 'flac' | 'pcm';

export interface MiniMaxSpeechOptions {
  stream?: boolean;
  language_boost?: string;
  output_format?: MiniMaxAudioFormat;
  voice_setting?: Record<string, unknown>;
  pronunciation_dict?: Record<string, unknown>;
  audio_setting?: Record<string, unknown>;
  voice_modify?: Record<string, unknown>;
  subtitle_enable?: boolean;
  [key: string]: unknown;
}

export interface MiniMaxSpeechConfig {
  name?: MiniMaxSpeechModel;
  apiKey?: string;
  region?: MiniMaxRegion;
  baseUrl?: string;
  options?: Omit<MiniMaxSpeechOptions, 'model' | 'text'>;
}

interface MiniMaxSpeechResponse {
  data?: { audio?: string; status?: number };
  base_resp?: { status_code?: number; status_msg?: string };
}

const ENDPOINTS: Record<MiniMaxRegion, string> = {
  global_en: 'https://api.minimax.io/v1/t2a_v2',
  cn_zh: 'https://api.minimaxi.com/v1/t2a_v2',
};

export class MiniMaxVoice extends MastraVoice {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly defaults: Omit<MiniMaxSpeechOptions, 'model' | 'text'>;

  constructor({ speechModel, speaker }: { speechModel?: MiniMaxSpeechConfig; speaker?: string } = {}) {
    const apiKey = speechModel?.apiKey ?? process.env.MINIMAX_API_KEY;
    const model = speechModel?.name ?? 'speech-2.8-hd';
    super({ speechModel: { name: model, apiKey }, speaker });
    if (!apiKey) {
      throw new Error('MINIMAX_API_KEY is not set');
    }
    this.apiKey = apiKey;
    this.endpoint = speechModel?.baseUrl ?? ENDPOINTS[speechModel?.region ?? 'global_en'];
    this.defaults = speechModel?.options ?? {};
  }

  async speak(
    input: string | NodeJS.ReadableStream,
    options?: MiniMaxSpeechOptions & { speaker?: string },
  ): Promise<NodeJS.ReadableStream> {
    const text = typeof input === 'string' ? input : await this.streamToString(input);
    if (!text.trim()) {
      throw new Error('Input text is empty');
    }

    const { speaker, voice_setting, ...requestOptions } = options ?? {};
    const voiceSetting: Record<string, unknown> = {
      ...(this.defaults.voice_setting ?? {}),
      ...(voice_setting ?? {}),
    };
    if (speaker) {
      voiceSetting.voice_id = speaker;
    } else if (this.speaker && !voiceSetting.voice_id) {
      voiceSetting.voice_id = this.speaker;
    }

    const payload: Record<string, unknown> = {
      model: this.speechModel?.name ?? 'speech-2.8-hd',
      text,
      stream: false,
      ...this.defaults,
      ...requestOptions,
      ...(Object.keys(voiceSetting).length > 0 ? { voice_setting: voiceSetting } : {}),
    };
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as MiniMaxSpeechResponse;
    const statusCode = result.base_resp?.status_code;
    if (!response.ok || (statusCode !== undefined && statusCode !== 0)) {
      throw new Error(result.base_resp?.status_msg || `MiniMax speech request failed (${response.status})`);
    }
    const audio = result.data?.audio;
    if (!audio) {
      throw new Error(`MiniMax speech response did not contain audio (status ${result.data?.status ?? 'unknown'})`);
    }

    const bytes =
      /^[0-9a-f]+$/i.test(audio) && audio.length % 2 === 0 ? Buffer.from(audio, 'hex') : Buffer.from(audio, 'base64');
    const stream = new PassThrough();
    stream.end(bytes);
    return stream;
  }

  async getSpeakers(): Promise<Array<{ voiceId: string }>> {
    return this.speaker ? [{ voiceId: this.speaker }] : [];
  }

  async getListener(): Promise<{ enabled: boolean }> {
    return { enabled: false };
  }

  async listen(): Promise<string> {
    throw new Error('MiniMax does not support speech recognition');
  }

  private async streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}

export { ENDPOINTS as MINIMAX_SPEECH_ENDPOINTS };
