// lib/images.js — shared OSS image listing & URL building (app.js + build-static.js)
'use strict';

const path = require('path');

const publicBaseUrl = 'https://img.yukinova.top/';
const PROCESS_SUFFIX = '?x-oss-process=image/auto-orient,1/resize,w_600/quality,q_30/format,webp';

function buildPublicUrl(objectName) {
  return objectName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
    .replace(/^/, publicBaseUrl);
}

// client = ali-oss instance (injected so both app.js and build-static.js share one impl)
async function listAllImages(client) {
  const images = [];
  let marker = null;

  do {
    const result = await client.list({ marker, 'max-keys': 1000 });
    const objects = result.objects || [];

    for (const obj of objects) {
      if (obj.name.endsWith('/')) continue;
      const originalUrl = buildPublicUrl(obj.name);
      images.push({
        name: path.basename(obj.name),
        objectKey: obj.name,
        lastModified: obj.lastModified || null,
        url: originalUrl,
        thumbUrl: originalUrl + PROCESS_SUFFIX,
      });
    }

    marker = result.nextMarker;
  } while (marker);

  images.sort((a, b) => {
    const timeA = a.lastModified ? Date.parse(a.lastModified) : 0;
    const timeB = b.lastModified ? Date.parse(b.lastModified) : 0;
    return timeB - timeA;
  });

  return images;
}

module.exports = { publicBaseUrl, PROCESS_SUFFIX, buildPublicUrl, listAllImages };