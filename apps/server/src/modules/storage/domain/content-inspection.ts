import { createHash } from 'node:crypto';
import { extname } from 'node:path';

import { ApiError } from '@lingcoo-tech/http';
import { fileTypeFromBuffer } from 'file-type';

import type { InspectedAssetContent } from './model.js';

const BINARY_TYPES: Readonly<
  Record<string, { extension: string; mediaKind: InspectedAssetContent['mediaKind'] }>
> = {
  'image/jpeg': { extension: 'jpg', mediaKind: 'image' },
  'image/png': { extension: 'png', mediaKind: 'image' },
  'image/gif': { extension: 'gif', mediaKind: 'image' },
  'image/webp': { extension: 'webp', mediaKind: 'image' },
  'image/avif': { extension: 'avif', mediaKind: 'image' },
  'application/pdf': { extension: 'pdf', mediaKind: 'document' },
};

const TEXT_TYPES: Readonly<Record<string, string>> = {
  'text/plain': 'txt',
  'text/csv': 'csv',
};

const MIME_ALIASES: Readonly<Record<string, string>> = {
  'image/jpg': 'image/jpeg',
  'application/x-pdf': 'application/pdf',
  'application/csv': 'text/csv',
};

export function assertDeclaredAssetType(contentType: string): InspectedAssetContent['mediaKind'] {
  const canonical = MIME_ALIASES[contentType] ?? contentType;
  const binary = BINARY_TYPES[canonical];
  if (!binary && !TEXT_TYPES[canonical]) {
    throw new ApiError(415, 'STORAGE_CONTENT_TYPE_REJECTED', '文件声明类型不受支持');
  }
  return binary?.mediaKind ?? 'text';
}

export async function inspectAssetContent(input: {
  body: Buffer;
  filename: string;
  declaredContentType: string;
  declaredSizeBytes: number;
  maxBytes: number;
}): Promise<InspectedAssetContent> {
  if (input.body.length === 0 || input.body.length !== input.declaredSizeBytes) {
    throw new ApiError(400, 'STORAGE_SIZE_MISMATCH', '上传文件大小与预授权声明不一致');
  }
  if (input.body.length > input.maxBytes) {
    throw new ApiError(413, 'STORAGE_FILE_TOO_LARGE', '文件超过系统允许的大小');
  }

  const declared = MIME_ALIASES[input.declaredContentType] ?? input.declaredContentType;
  const detected = await fileTypeFromBuffer(input.body);
  if (detected) {
    const facts = BINARY_TYPES[detected.mime];
    if (!facts || declared !== detected.mime) {
      throw new ApiError(
        415,
        'STORAGE_CONTENT_TYPE_REJECTED',
        '文件内容与声明类型不一致或不受支持',
      );
    }
    assertExtension(
      input.filename,
      facts.extension,
      detected.mime === 'image/jpeg' ? ['jpeg'] : [],
    );
    return result(input.body, detected.mime, facts.extension, facts.mediaKind);
  }

  const textExtension = TEXT_TYPES[declared];
  if (!textExtension || input.body.includes(0) || !isUtf8(input.body)) {
    throw new ApiError(
      415,
      'STORAGE_CONTENT_TYPE_REJECTED',
      '仅允许安全图片、PDF、UTF-8 文本和 CSV',
    );
  }
  assertExtension(input.filename, textExtension);
  return result(input.body, declared, textExtension, 'text');
}

function assertExtension(filename: string, expected: string, aliases: string[] = []): void {
  const actual = extname(filename).slice(1).toLowerCase();
  if (![expected, ...aliases].includes(actual)) {
    throw new ApiError(415, 'STORAGE_EXTENSION_MISMATCH', '文件扩展名与文件内容不一致');
  }
}

function isUtf8(value: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(value);
    return true;
  } catch {
    return false;
  }
}

function result(
  body: Buffer,
  contentType: string,
  extension: string,
  mediaKind: InspectedAssetContent['mediaKind'],
): InspectedAssetContent {
  return {
    contentType,
    extension,
    mediaKind,
    sizeBytes: body.length,
    checksumSha256: createHash('sha256').update(body).digest('hex'),
  };
}
