// lib/profanity.js — 부적절한 언어 필터
// profanity-words.js(사전 목록) 기반으로 공백/특수문자를 제거한 뒤 부분 일치 검사.
// 조건/검증 룰:
//  - 단독 한 글자(년/놈/젖 등)와 일상어(시간, 피망, 박사, 갓갓 등)는 제외해 오탐을 줄인다.
//  - '욕설' 단어는 목록에 명시적으로 포함한다.

import { PROFANITY_WORDS } from './profanity-words'

const STRIP = /[\s.,!?~`'"·\u00a0\u3000()\[\]{}<>_\-－=|+*^%$#@;:/\\]/g

export function normalizeProfanity(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(STRIP, '')
}

const WORDS = [...new Set(PROFANITY_WORDS.map(normalizeProfanity).filter(Boolean))].sort(
  (a, b) => b.length - a.length
)

export function findProfanity(text) {
  const n = normalizeProfanity(text)
  if (!n) return null
  for (const w of WORDS) {
    if (n.includes(w)) return w
  }
  return null
}