export type AssetKind = 'font' | 'image' | 'svg' | 'video' | 'animation'

interface BaseAsset {
  id: string
  name: string
  kind: AssetKind
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  url: string
  tags: string[]

  folderId: string | null
}

export interface FontAsset extends BaseAsset {
  kind: 'font'
  fontFamily: string
  fontStyle: 'normal' | 'italic'
  fontWeight: number
  formats: Array<'woff2' | 'woff' | 'ttf' | 'otf'>
}

export interface ImageAsset extends BaseAsset {
  kind: 'image'
  width: number
  height: number
  alt: string
}

export interface SvgAsset extends BaseAsset {
  kind: 'svg'
  viewBox: string
  width: number
  height: number
}

export interface VideoAsset extends BaseAsset {
  kind: 'video'
  width: number
  height: number
  durationMs: number
  poster?: string
}

export type AnimationFormat = 'lottie' | 'rive' | 'css'

export interface AnimationAsset extends BaseAsset {
  kind: 'animation'
  format: AnimationFormat
  durationMs: number
  loop: boolean
}

export type Asset = FontAsset | ImageAsset | SvgAsset | VideoAsset | AnimationAsset

export type AssetByKind = {
  font: FontAsset
  image: ImageAsset
  svg: SvgAsset
  video: VideoAsset
  animation: AnimationAsset
}

export interface AssetFolder {
  id: string
  name: string
  parentId: string | null
  createdAt: string
}

export interface AssetRegistry {
  assets: Record<string, Asset>
  folders: Record<string, AssetFolder>
}
