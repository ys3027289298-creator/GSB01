// 可播种的确定性随机数 (mulberry32)，用于对比测试的相同目标规则。
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeRng(seed) {
  const next = mulberry32(seed)
  return {
    next,
    range(min, max) {
      return min + (max - min) * next()
    },
    int(min, max) {
      return Math.floor(min + (max - min + 1) * next())
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)]
    },
    shuffle(arr) {
      const copy = arr.slice()
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    }
  }
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0
}
