import { supabase } from "@/lib/supabaseClient";

import type {
  ClassPost,
  CreateClassPostInput,
  PublishableClass,
  UpdateClassPostInput,
} from "../types/classPosts.types";

export async function getClassPostFeed(
  classId: string | null = null,
  limit = 50,
  offset = 0,
): Promise<ClassPost[]> {
  const { data, error } = await supabase.rpc(
    "class_post_feed",
    {
      p_class_id: classId,
      p_limit: limit,
      p_offset: offset,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as ClassPost[];
}

export async function getPublishableClasses(): Promise<
  PublishableClass[]
> {
  const { data, error } = await supabase.rpc(
    "class_post_publishable_classes",
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as PublishableClass[];
}

export async function markClassPostAsRead(
  postId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "class_post_mark_read",
    {
      p_post_id: postId,
    },
  );

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function createClassPost(
  input: CreateClassPostInput,
): Promise<string> {
  const publishedAt =
    input.publishedAt ?? new Date().toISOString();

  const { data, error } = await supabase.rpc(
    "class_post_create",
    {
      p_class_id: input.classId,
      p_title: input.title,
      p_body: input.body,
      p_audience: input.audience,
      p_priority: input.priority,
      p_post_type: input.postType,
      p_is_pinned: input.isPinned,
      p_published_at: publishedAt,
      p_expires_at: input.expiresAt ?? null,
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(
      "La publication n'a pas pu être créée.",
    );
  }

  return String(data);
}

export async function updateClassPost(
  input: UpdateClassPostInput,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "class_post_update",
    {
      p_post_id: input.postId,
      p_title: input.title,
      p_body: input.body,
      p_audience: input.audience,
      p_priority: input.priority,
      p_post_type: input.postType,
      p_is_pinned: input.isPinned,
      p_published_at: input.publishedAt,
      p_expires_at: input.expiresAt ?? null,
    },
  );

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function deleteClassPost(
  postId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "class_post_delete",
    {
      p_post_id: postId,
    },
  );

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function getClassPostArchiveFeed(
  classId: string | null = null,
  limit = 50,
  offset = 0,
): Promise<ClassPost[]> {
  const { data, error } = await supabase.rpc(
    "class_post_archive_feed",
    {
      p_class_id: classId,
      p_limit: limit,
      p_offset: offset,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as ClassPost[];
}

export async function archiveClassPost(
  postId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "class_post_archive",
    {
      p_post_id: postId,
    },
  );

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function restoreClassPost(
  postId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "class_post_restore",
    {
      p_post_id: postId,
    },
  );

  if (error) {
    throw error;
  }

  return Boolean(data);
}