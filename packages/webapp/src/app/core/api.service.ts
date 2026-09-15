import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AppProfile, Article } from '@org/schema';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url';

@Injectable({ providedIn: 'root' })
export class ArticleApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  listApps(): Promise<AppProfile[]> {
    return firstValueFrom(this.http.get<AppProfile[]>(`${this.baseUrl}/apps`));
  }

  getAppProfile(appId: string): Promise<AppProfile> {
    return firstValueFrom(
      this.http.get<AppProfile>(
        `${this.baseUrl}/apps/${encodeURIComponent(appId)}`,
      ),
    );
  }

  listPublished(appId: string): Promise<Article[]> {
    return firstValueFrom(
      this.http.get<Article[]>(
        `${this.baseUrl}/apps/${encodeURIComponent(appId)}/articles`,
      ),
    );
  }

  getPublishedBySlug(appId: string, slug: string): Promise<Article> {
    return firstValueFrom(
      this.http.get<Article>(
        `${this.baseUrl}/apps/${encodeURIComponent(appId)}/articles/by-slug/${encodeURIComponent(slug)}`,
      ),
    );
  }
}
