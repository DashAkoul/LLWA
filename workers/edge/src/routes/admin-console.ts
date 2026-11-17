import type { Env, RequestContext } from '../types';
import { jsonError, jsonSuccess, readJson } from '../lib/response';
import { SupabaseClient } from '../services/supabase';
import {
  PROMPT_TASK_KEYS,
  isPromptTaskKey,
} from '../services/prompt-registry';

/**
 * کنسول مدیریت — پرامپت‌ها و فلگ‌های قابلیت.
 *
 * ⚠️ همهٔ این مسیرها در `routeClassForAction` با `ADMIN` علامت خورده‌اند،
 * پس میدل‌ور RBAC قبل از رسیدن به اینجا نقش را بررسی می‌کند.
 */

export interface PromptRow {
  id: string;
  task_key: string;
  version: number;
  body: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface FlagRow {
  key: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
}

// ═════════════════════════════════════════════════════════════════════
// GET /gate?action=admin-prompts
// ═════════════════════════════════════════════════════════════════════

export async function handleAdminPrompts(
  _request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId } = context;
  const db = new SupabaseClient(env);

  try {
    const rows = (await db.select<PromptRow>('ai_prompts', {
      select: 'id,task_key,version,body,is_active,notes,created_at',
      order: 'task_key.asc,version.desc',
    })) as PromptRow[];

    return jsonSuccess({ prompts: rows ?? [] }, requestId, env);
  } catch (err) {
    return jsonError(
      'INTERNAL_ERROR',
      `Failed to load prompts: ${err instanceof Error ? err.message : String(err)}`,
      requestId,
      env,
      500
    );
  }
}

// ═════════════════════════════════════════════════════════════════════
// POST /gate?action=admin-prompt-save
// ═════════════════════════════════════════════════════════════════════

/**
 * ذخیرهٔ پرامپت.
 *
 * ⚠️ هر ذخیره یک **نسخهٔ جدید** می‌سازد؛ نسخهٔ قبلی هرگز بازنویسی
 * نمی‌شود. اگر `activate` روشن باشد، نسخهٔ قبلی اول غیرفعال و بعد نسخهٔ
 * جدید فعال می‌شود تا ایندکس یکتای «یک فعال در هر task» نقض نشود.
 */
export async function handleAdminPromptSave(
  request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId, userId } = context;
  const body = await readJson<{
    taskKey?: string;
    body?: string;
    notes?: string;
    activate?: boolean;
  }>(request);

  if (!isPromptTaskKey(body?.taskKey)) {
    return jsonError(
      'VALIDATION_ERROR',
      `taskKey must be one of: ${PROMPT_TASK_KEYS.join(', ')}`,
      requestId,
      env,
      400
    );
  }

  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (text.length < 20) {
    return jsonError('VALIDATION_ERROR', 'Prompt body is too short', requestId, env, 400);
  }

  const db = new SupabaseClient(env);

  try {
    // شمارهٔ نسخهٔ بعدی
    const existing = (await db.select<{ version: number }>('ai_prompts', {
      select: 'version',
      task_key: `eq.${body.taskKey}`,
      order: 'version.desc',
      limit: '1',
    })) as { version: number }[];

    const nextVersion = (existing?.[0]?.version ?? 0) + 1;

    if (body.activate) {
      // اول همه را غیرفعال کن (تک‌فعالی در سطح DB تضمین شده)
      await db.update('ai_prompts', { task_key: `eq.${body.taskKey}`, is_active: 'eq.true' }, {
        is_active: false,
      });
    }

    const inserted = (await db.insert<PromptRow>('ai_prompts', {
      task_key: body.taskKey,
      version: nextVersion,
      body: text,
      is_active: Boolean(body.activate),
      notes: body.notes?.trim() || null,
      created_by: userId ?? null,
    })) as PromptRow;

    await writeAudit(env, userId, 'prompt.save', body.taskKey, {
      version: nextVersion,
      activated: Boolean(body.activate),
    });

    return jsonSuccess({ prompt: inserted }, requestId, env);
  } catch (err) {
    return jsonError(
      'INTERNAL_ERROR',
      `Failed to save prompt: ${err instanceof Error ? err.message : String(err)}`,
      requestId,
      env,
      500
    );
  }
}

// ═════════════════════════════════════════════════════════════════════
// POST /gate?action=admin-prompt-activate
// ═════════════════════════════════════════════════════════════════════

export async function handleAdminPromptActivate(
  request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId, userId } = context;
  const body = await readJson<{ id?: string }>(request);

  if (!body?.id) {
    return jsonError('VALIDATION_ERROR', 'id is required', requestId, env, 400);
  }

  const db = new SupabaseClient(env);

  try {
    const rows = (await db.select<PromptRow>('ai_prompts', {
      select: 'id,task_key,version',
      id: `eq.${body.id}`,
      limit: '1',
    })) as PromptRow[];

    const target = rows?.[0];
    if (!target) {
      return jsonError('NOT_FOUND', 'Prompt not found', requestId, env, 404);
    }

    await db.update('ai_prompts', { task_key: `eq.${target.task_key}`, is_active: 'eq.true' }, {
      is_active: false,
    });
    await db.update('ai_prompts', { id: `eq.${target.id}` }, { is_active: true });

    await writeAudit(env, userId, 'prompt.activate', target.task_key, {
      version: target.version,
    });

    return jsonSuccess({ ok: true }, requestId, env);
  } catch (err) {
    return jsonError(
      'INTERNAL_ERROR',
      `Failed to activate prompt: ${err instanceof Error ? err.message : String(err)}`,
      requestId,
      env,
      500
    );
  }
}

// ═════════════════════════════════════════════════════════════════════
// GET /gate?action=admin-flags
// ═════════════════════════════════════════════════════════════════════

export async function handleAdminFlags(
  _request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId } = context;
  const db = new SupabaseClient(env);

  try {
    const rows = (await db.select<FlagRow>('feature_flags', {
      select: 'key,enabled,description,updated_at',
      order: 'key.asc',
    })) as FlagRow[];

    return jsonSuccess({ flags: rows ?? [] }, requestId, env);
  } catch (err) {
    return jsonError(
      'INTERNAL_ERROR',
      `Failed to load flags: ${err instanceof Error ? err.message : String(err)}`,
      requestId,
      env,
      500
    );
  }
}

// ═════════════════════════════════════════════════════════════════════
// POST /gate?action=admin-flag-set
// ═════════════════════════════════════════════════════════════════════

export async function handleAdminFlagSet(
  request: Request,
  context: RequestContext
): Promise<Response> {
  const { env, requestId, userId } = context;
  const body = await readJson<{ key?: string; enabled?: boolean; description?: string }>(request);

  if (!body?.key || typeof body.enabled !== 'boolean') {
    return jsonError('VALIDATION_ERROR', 'key and enabled are required', requestId, env, 400);
  }

  const db = new SupabaseClient(env);

  try {
    const rows = (await db.select<FlagRow>('feature_flags', {
      select: 'key',
      key: `eq.${body.key}`,
      limit: '1',
    })) as FlagRow[];

    let flag: FlagRow;
    if (rows?.length) {
      const updated = (await db.update<FlagRow>(
        'feature_flags',
        { key: body.key },
        {
          enabled: body.enabled,
          description: body.description ?? undefined,
          updated_by: userId ?? null,
          updated_at: new Date().toISOString(),
        },
        { single: true }
      )) as FlagRow;
      flag = updated;
    } else {
      const created = (await db.insert<FlagRow>('feature_flags', {
        key: body.key,
        enabled: body.enabled,
        description: body.description ?? null,
        updated_by: userId ?? null,
      })) as FlagRow;
      flag = created;
    }

    await writeAudit(env, userId, 'flag.set', body.key, { enabled: body.enabled });

    return jsonSuccess({ flag }, requestId, env);
  } catch (err) {
    return jsonError(
      'INTERNAL_ERROR',
      `Failed to set flag: ${err instanceof Error ? err.message : String(err)}`,
      requestId,
      env,
      500
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

async function writeAudit(
  env: Env,
  actorId: string | undefined,
  action: string,
  target: string,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    const db = new SupabaseClient(env);
    await db.insert('audit_log', {
      actor_id: actorId ?? null,
      action,
      target,
      meta,
    });
  } catch {
    // audit نباید عملیات اصلی را بشکند
  }
}
