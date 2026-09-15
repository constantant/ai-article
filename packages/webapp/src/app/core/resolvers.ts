import { inject } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import type { AppProfile, Article } from '@org/schema';
import { ArticleApiService } from './api.service';
import { ThemeService } from './theme.service';

export const appProfileResolver: ResolveFn<AppProfile> = async (route) => {
  const api = inject(ArticleApiService);
  const theme = inject(ThemeService);
  const appId = route.paramMap.get('appId') as string;

  const profile = await api.getAppProfile(appId);
  theme.apply(profile.designTokens);
  return profile;
};

export const publishedArticlesResolver: ResolveFn<Article[]> = (route) => {
  const api = inject(ArticleApiService);
  const appId = route.paramMap.get('appId') as string;
  return api.listPublished(appId);
};

export const articleBySlugResolver: ResolveFn<Article> = (route) => {
  const api = inject(ArticleApiService);
  const appId = route.paramMap.get('appId') as string;
  const slug = route.paramMap.get('articleSlug') as string;
  return api.getPublishedBySlug(appId, slug);
};

export const appListResolver: ResolveFn<AppProfile[]> = () => {
  const api = inject(ArticleApiService);
  return api.listApps();
};
