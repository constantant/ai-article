import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

/**
 * Unlike auth codes/tokens, registered OAuth clients (from Dynamic Client
 * Registration — mobile Claude self-registers on first connect) need real,
 * indefinite persistence: client_id/client_secret must be resolvable on
 * every future request, not just within a token's TTL.
 */
export interface ClientRecordStore {
  get(clientId: string): Promise<OAuthClientInformationFull | undefined>;
  put(client: OAuthClientInformationFull): Promise<void>;
}

/** Local/dev store for running HTTP mode outside Lambda — same plain-JSON-file shape as key-store.ts. */
export class LocalFileClientRecordStore implements ClientRecordStore {
  constructor(private readonly filePath: string) {}

  private readAll(): Record<string, OAuthClientInformationFull> {
    if (!existsSync(this.filePath)) {
      return {};
    }
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  async get(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.readAll()[clientId];
  }

  async put(client: OAuthClientInformationFull): Promise<void> {
    const all = this.readAll();
    all[client.client_id] = client;
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(all, null, 2) + '\n');
  }
}

export class DynamoDbClientRecordStore implements ClientRecordStore {
  private readonly client: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    endpoint = process.env['DYNAMODB_ENDPOINT'],
  ) {
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({ endpoint }));
  }

  async get(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const res = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: { clientId } }),
    );
    return res.Item ? (res.Item['data'] as OAuthClientInformationFull) : undefined;
  }

  async put(client: OAuthClientInformationFull): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { clientId: client.client_id, data: client },
      }),
    );
  }
}

export class OAuthClientStore implements OAuthRegisteredClientsStore {
  constructor(private readonly records: ClientRecordStore) {}

  getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.records.get(clientId);
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
  ): Promise<OAuthClientInformationFull> {
    // The SDK's register handler defaults clientIdGeneration to true, so by
    // the time this is called `client` already carries client_id and
    // client_id_issued_at even though the declared parameter type omits
    // them (that omission only describes what a caller must supply).
    const full = client as OAuthClientInformationFull;
    await this.records.put(full);
    return full;
  }
}
