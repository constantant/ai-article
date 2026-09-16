import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import type { Block, EmbedBlock } from '@org/schema';
import { RichTextComponent } from '../rich-text/rich-text';

@Component({
  selector: 'app-block-renderer',
  imports: [RichTextComponent],
  templateUrl: './block-renderer.html',
  styleUrl: './block-renderer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockRendererComponent {
  blocks = input.required<Block[]>();

  private readonly sanitizer = inject(DomSanitizer);

  resolveEmbedUrl(block: EmbedBlock): SafeResourceUrl | null {
    const src = this.toEmbedSrc(block);
    return src ? this.sanitizer.bypassSecurityTrustResourceUrl(src) : null;
  }

  // Twitter has no stable, script-free iframe embed, so it always falls back to a link.
  private toEmbedSrc(block: EmbedBlock): string | null {
    switch (block.provider) {
      case 'youtube': {
        const id = this.extractYouTubeId(block.url);
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
      case 'codepen':
        return this.extractCodepenEmbed(block.url);
      case 'generic':
        return this.isHttpsUrl(block.url) ? block.url : null;
      default:
        return null;
    }
  }

  private isHttpsUrl(url: string): boolean {
    try {
      return new URL(url).protocol === 'https:';
    } catch {
      return false;
    }
  }

  private extractYouTubeId(url: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null;
    }
    if (!parsed.hostname.endsWith('youtube.com')) {
      return null;
    }
    if (parsed.pathname === '/watch') {
      return parsed.searchParams.get('v');
    }
    const match = parsed.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/);
    return match ? match[1] : null;
  }

  private extractCodepenEmbed(url: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (!parsed.hostname.endsWith('codepen.io')) {
      return null;
    }
    const [user, kind, slug] = parsed.pathname.split('/').filter(Boolean);
    if (!user || !slug || !['pen', 'embed', 'details', 'full'].includes(kind)) {
      return null;
    }
    return `https://codepen.io/${user}/embed/${slug}?default-tab=result`;
  }
}
