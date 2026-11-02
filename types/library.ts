// ─── The library around the components (proposal 0041) ────────────────────────
// A design system is not only its components and tokens: it is also the documentation
// someone wrote, the assets they uploaded, and the way the library is organised. Those
// were the last document fields the `.milda` did not carry, so an export described a
// system whose docs and asset library had vanished - authored content, silently dropped.
//
// Declared here rather than imported from the editor, for the same reason as the part
// model: `@mildastudio/milda` is standalone, and the AST→IR adapter lowers each shape.

import type { PropValue } from './ast'

// ─── Docs (proposal 0018) ─────────────────────────────────────────────────────
// A page is a title plus an ordered list of blocks. Two kinds of block: prose the author
// wrote, and TRANSCLUSIONS that point at something in the system (a component, a prop, a
// token scale). A transclusion is addressed by NAME, never by a workspace id, so it
// resolves inside the file.

export type DocBlockDecl =
  | { kind: 'prose'; prose: string; text: string; anchor?: string }
  | { kind: 'divider' }
  | { kind: 'image'; asset?: string }
  | { kind: 'component'; component?: string }
  | { kind: 'componentProps'; component?: string }
  | { kind: 'componentEvents'; component?: string }
  | { kind: 'componentComposition'; component?: string }
  | { kind: 'componentProp'; component?: string; prop?: string }
  | { kind: 'componentEvent'; component?: string; event?: string }
  | { kind: 'example'; example?: string }
  | { kind: 'componentGroup'; group?: string }
  | { kind: 'tokens'; tokenType?: string }
  | { kind: 'swatch'; tokenType?: string }

export interface DocPageDecl {
  title: string
  /** The sidebar section this page sits in. */
  group?: string
  /** The parent page's TITLE, for a nested page. */
  parent?: string
  blocks: DocBlockDecl[]
}

export interface DocsSiteDecl {
  name?: string
  tagline?: string
  version?: string
  searchPlaceholder?: string
}

export interface DocsFooterLinkDecl {
  label: string
  href: string
}

export interface DocsFooterDecl {
  links: DocsFooterLinkDecl[]
  copyright?: string
}

export interface DocsDecl {
  pages: DocPageDecl[]
  site?: DocsSiteDecl
  footer?: DocsFooterDecl
}

// ─── Assets (proposal 0041 §1.2) ──────────────────────────────────────────────
// The asset LIBRARY: folders, and each uploaded file's identity and metadata. The bytes
// are a separate question (§1.2): a file can carry a `data` URI and be self-contained, or
// carry only the `url` and travel beside its bytes in a bundle. Both are expressible here,
// which is what lets one format serve the diffable git mirror and the emailable single file.

export interface AssetFolderDecl {
  /** The folder's PATH (`Brand/Icons`), which is its nesting written down. */
  path: string
}

export interface AssetDecl {
  kind: string
  name: string
  /** The containing folder's path; absent = the library root. */
  folder?: string
  mimeType?: string
  sizeBytes?: number
  uploadedAt?: string
  /** Where the bytes live. A `data:` URI here makes the file self-contained. */
  url?: string
  tags?: string[]
  /** Per-kind metadata (`width`, `viewBox`, `fontWeight`, …), validated on lowering. */
  props: Record<string, PropValue>
}

export interface AssetsDecl {
  folders: AssetFolderDecl[]
  assets: AssetDecl[]
}

// ─── The icon library ─────────────────────────────────────────────────────────
// Which icon sets the system draws from and which glyphs it has curated. A part names a glyph
// by bare NAME (`check`), and that name only means something against this library: a curated
// glyph by its name or label, else the FIRST set's prefix. So the order of the sets is meaning,
// and a file without the library turns every icon into a placeholder on import.
//
// Nothing here carries an id. Parts reference glyphs by name and custom glyphs reference their
// asset by name (FORMAT.md §3), so a reader derives every id from what the file says.

export interface IconSetDecl {
  /** The set's prefix in its provider's namespace (`lucide`, `ph`), which is what resolves. */
  prefix: string
  name: string
  provider?: string
  license?: string
  /** Four representative glyph names a preview shows for the set. */
  samples?: string[]
}

export type IconDecl =
  | {
      kind: 'set'
      prefix: string
      name: string
      label?: string
      /** The glyph's vendored SVG body, so a generated package needs no CDN (proposal 0019). */
      svg?: string
    }
  | {
      kind: 'custom'
      name: string
      /** The NAME of the asset in the file's `assets` block whose bytes draw this glyph. */
      asset?: string
      label?: string
    }

export interface IconsDecl {
  sets: IconSetDecl[]
  icons: IconDecl[]
}
