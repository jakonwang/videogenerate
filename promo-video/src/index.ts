import React from 'react'
import {Composition, registerRoot} from 'remotion'
import {PromoVideo} from './PromoVideo'

export const RemotionRoot: React.FC = () => {
  return React.createElement(Composition, {
    id: 'VideoGeneratePromo',
    component: PromoVideo,
    durationInFrames: 1440,
    fps: 30,
    width: 1920,
    height: 1080,
  })
}

registerRoot(RemotionRoot)
