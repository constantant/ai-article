import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Block } from '@org/schema';
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
}
