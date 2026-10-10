import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffImageType, isValidImage, MIN_IMAGE_BYTES } from './image-validate.js';

// Buffers that start with a real signature, padded well above MIN_IMAGE_BYTES.
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...new Array(120).fill(0),
]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(120).fill(0)]);
const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...new Array(120).fill(0)]);
const webp = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, ...new Array(120).fill(0),
]);
const bmp = Buffer.from([0x42, 0x4d, ...new Array(120).fill(0)]);
const ico = Buffer.from([0x00, 0x00, 0x01, 0x00, ...new Array(120).fill(0)]);
const html = Buffer.from('<!DOCTYPE html><html><body>not found</body></html>');

test('MIN_IMAGE_BYTES is a small sane floor', () => {
  assert.ok(MIN_IMAGE_BYTES >= 16 && MIN_IMAGE_BYTES <= 512);
});

test('sniffImageType detects each supported format', () => {
  assert.equal(sniffImageType(png), 'image/png');
  assert.equal(sniffImageType(jpeg), 'image/jpeg');
  assert.equal(sniffImageType(gif), 'image/gif');
  assert.equal(sniffImageType(webp), 'image/webp');
  assert.equal(sniffImageType(bmp), 'image/bmp');
  assert.equal(sniffImageType(ico), 'image/x-icon');
});

test('sniffImageType returns null for html and short buffers', () => {
  assert.equal(sniffImageType(html), null);
  assert.equal(sniffImageType(Buffer.from([0x89, 0x50])), null);
});

test('isValidImage accepts a real image', () => {
  assert.equal(isValidImage(png, 'image/png'), true);
  assert.equal(isValidImage(webp, undefined), true);
});

test('isValidImage rejects html content-type even with image bytes', () => {
  assert.equal(isValidImage(png, 'text/html; charset=utf-8'), false);
});

test('isValidImage rejects short buffers and unknown bytes', () => {
  assert.equal(isValidImage(Buffer.from([0x89, 0x50]), 'image/png'), false);
  assert.equal(isValidImage(Buffer.from(new Array(200).fill(0x20)), 'image/png'), false);
});
