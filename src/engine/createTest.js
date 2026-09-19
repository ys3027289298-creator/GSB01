import { createClickTest } from './tests/clickTest.js'
import { createFlickTest } from './tests/flickTest.js'
import { createTrackingTest } from './tests/trackingTest.js'
import { createRecoilTest } from './tests/recoilTest.js'

export function createTest(kind, settings, seed) {
  switch (kind) {
    case 'click':
      return createClickTest(settings, seed)
    case 'flick':
      return createFlickTest(settings, seed)
    case 'tracking':
      return createTrackingTest(settings, seed)
    case 'recoil':
      return createRecoilTest(settings, seed)
    default:
      throw new Error(`未知测试类型: ${kind}`)
  }
}

export { scoreClick, scoreFlick, scoreTracking, scoreRecoil } from './scoring.js'
