import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AppProfile, Article } from '@org/schema';
import { firstValueFrom } from 'rxjs';

// Local test app talking to the local REST API — not meant to be configurable per deployment.
const API_BASE_URL = 'http://localhost:3000/api';

@Injectable({ providedIn: 'root' })
export class ArticleApiService {
  private readonly http = inject(HttpClient);

  listApps(): Promise<AppProfile[]> {
    return firstValueFrom(this.http.get<AppProfile[]>(`${API_BASE_URL}/apps`));
  }

  getAppProfile(appId: string): Promise<AppProfile> {
    return firstValueFrom(this.http.get<AppProfile>(`${API_BASE_URL}/apps/${encodeURIComponent(appId)}`));
  }

  listPublished(appId: string): Promise<Article[]> {
    return firstValueFrom(this.http.get<Article[]>(`${API_BASE_URL}/apps/${encodeURIComponent(appId)}/articles`));
  }

  getPublishedBySlug(appId: string, slug: string): Promise<Article> {
    return firstValueFrom(
      this.http.get<Article>(
        `${API_BASE_URL}/apps/${encodeURIComponent(appId)}/articles/by-slug/${encodeURIComponent(slug)}`,
      ),
    );
  }
}
