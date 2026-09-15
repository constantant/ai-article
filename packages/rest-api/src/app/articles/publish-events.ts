import { Injectable } from '@nestjs/common';
import type { Article } from '@org/schema';
import { EventEmitter } from 'node:events';

@Injectable()
export class PublishEvents {
  private readonly emitter = new EventEmitter();

  emitPublished(article: Article): void {
    this.emitter.emit('published', article);
  }

  onPublished(listener: (article: Article) => void): void {
    this.emitter.on('published', listener);
  }
}
