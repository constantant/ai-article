import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { RichText } from '@org/schema';

@Component({
  selector: 'app-rich-text',
  templateUrl: './rich-text.html',
  styleUrl: './rich-text.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RichTextComponent {
  runs = input.required<RichText>();
}
