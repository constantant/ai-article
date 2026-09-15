import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AppProfile, Article } from '@org/schema';
import { BlockRendererComponent } from '../../components/block-renderer/block-renderer';

@Component({
  selector: 'app-article-page',
  imports: [RouterLink, BlockRendererComponent],
  templateUrl: './article-page.html',
  styleUrl: './article-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticlePageComponent {
  profile = input.required<AppProfile>();
  article = input.required<Article>();
}
