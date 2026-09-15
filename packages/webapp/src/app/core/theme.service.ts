import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import type { DesignTokens } from '@org/schema';

/**
 * A few neutral token keys also drive Angular Material's own M3 system
 * variables (--mat-sys-*), so the app chrome (toolbar, buttons) shifts in
 * step with the content. Content blocks themselves are styled purely
 * through the --app-* custom properties, which every design token gets —
 * that's what stays correct even for a token the platform doesn't know
 * Material's naming for.
 */
const MATERIAL_TOKEN_MAP: Record<string, string> = {
  'color-surface': '--mat-sys-surface',
  'color-on-surface': '--mat-sys-on-surface',
  'color-primary': '--mat-sys-primary',
  'color-primary-container': '--mat-sys-primary-container',
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private appliedProperties: string[] = [];

  /**
   * Sets design tokens as inline styles on <html>. Running this during a
   * route resolver (before the page renders) means the SSR output already
   * carries the correct theme — no flash of the wrong app's colors.
   *
   * Clears any properties left over from a previously applied theme first,
   * since two apps' token sets aren't guaranteed to share the same keys.
   */
  apply(tokens: DesignTokens): void {
    this.reset();
    const root = this.document.documentElement.style;
    const applied: string[] = [];
    for (const [key, value] of Object.entries(tokens)) {
      const appVar = `--app-${key}`;
      root.setProperty(appVar, value);
      applied.push(appVar);
      const materialVar = MATERIAL_TOKEN_MAP[key];
      if (materialVar) {
        root.setProperty(materialVar, value);
        applied.push(materialVar);
      }
    }
    this.appliedProperties = applied;
  }

  /** Removes any inline theme properties set by `apply`. */
  reset(): void {
    const root = this.document.documentElement.style;
    for (const property of this.appliedProperties) {
      root.removeProperty(property);
    }
    this.appliedProperties = [];
  }
}
