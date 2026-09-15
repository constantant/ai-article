import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AppProfile } from '@org/schema';

@Component({
  selector: 'app-app-list',
  imports: [RouterLink],
  templateUrl: './app-list.html',
  styleUrl: './app-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppListComponent {
  apps = input.required<AppProfile[]>();
}
