import { Route } from '@angular/router';
import { appListResolver, appProfileResolver, articleBySlugResolver, publishedArticlesResolver } from './core/resolvers';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./pages/app-list/app-list').then((m) => m.AppListComponent),
    resolve: { apps: appListResolver },
  },
  {
    path: 'app/:appId',
    loadComponent: () => import('./pages/app-home/app-home').then((m) => m.AppHomeComponent),
    resolve: { profile: appProfileResolver, articles: publishedArticlesResolver },
  },
  {
    path: 'app/:appId/articles/:articleSlug',
    loadComponent: () => import('./pages/article-page/article-page').then((m) => m.ArticlePageComponent),
    resolve: { profile: appProfileResolver, article: articleBySlugResolver },
  },
];
