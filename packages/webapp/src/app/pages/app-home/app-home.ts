import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AppProfile, Article } from '@org/schema';

@Component({
  selector: 'app-app-home',
  imports: [RouterLink],
  templateUrl: './app-home.html',
  styleUrl: './app-home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHomeComponent {
  profile = input.required<AppProfile>();
  articles = input.required<Article[]>();
}
