import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { articleDraftInputSchema, type ArticleDraftInput } from '@org/schema';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ArticlesService } from './articles.service.js';

const articlePatchSchema = articleDraftInputSchema.partial();

@ApiTags('articles')
@Controller('apps/:appId/articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  @ApiOperation({
    summary:
      'List articles for an app. Public callers (no key) see published only; the app\'s own x-api-key also sees drafts.',
  })
  list(@Param('appId') appId: string, @Headers('x-api-key') apiKey?: string) {
    return this.articles.listForCaller(appId, apiKey);
  }

  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Get one published article by slug (public).' })
  getPublishedBySlug(@Param('appId') appId: string, @Param('slug') slug: string) {
    return this.articles.getPublishedBySlug(appId, slug);
  }

  @Post('validate')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Dry-run validate a draft/article against the app profile without persisting it.' })
  validate(@Param('appId') appId: string, @Body() input: unknown) {
    return this.articles.validateForPublish(appId, input);
  }

  @Post()
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Create a draft article.' })
  create(@Param('appId') appId: string, @Body(new ZodValidationPipe(articleDraftInputSchema)) input: ArticleDraftInput) {
    return this.articles.createDraft(appId, input);
  }

  @Get(':id')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: "Get an article (any status) by id — the authoring tool's own view." })
  get(@Param('appId') appId: string, @Param('id') id: string) {
    return this.articles.get(appId, id);
  }

  @Patch(':id')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Update a draft or published article.' })
  update(
    @Param('appId') appId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(articlePatchSchema)) patch: Partial<ArticleDraftInput>,
  ) {
    return this.articles.update(appId, id, patch);
  }

  @Post(':id/publish')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Transition a draft to published.' })
  publish(@Param('appId') appId: string, @Param('id') id: string) {
    return this.articles.publish(appId, id);
  }
}
