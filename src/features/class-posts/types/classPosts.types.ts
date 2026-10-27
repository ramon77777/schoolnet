export type ClassPostAudience =
  | "students"
  | "parents"
  | "students_and_parents";

export type ClassPostPriority =
  | "normal"
  | "important"
  | "urgent";

export type ClassPostType =
  | "announcement"
  | "academic"
  | "homework"
  | "event"
  | "reminder";

export interface PublishableClass {
  class_id: string;
  class_name: string;
  school_year: string | null;
  school_year_id: string | null;
}

export interface ClassPost {
  id: string;

  class_id: string;
  class_name: string;
  school_year: string | null;

  author_id: string;
  author_name: string;
  author_role: string;
  author_avatar_url: string | null;

  title: string;
  body: string;

  audience: ClassPostAudience;
  priority: ClassPostPriority;
  post_type: ClassPostType;

  is_pinned: boolean;

  published_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;

  is_read: boolean;
  read_at: string | null;

  read_count: number | null;

  can_edit: boolean;
  can_manage: boolean;
}

export interface CreateClassPostInput {
  classId: string;
  title: string;
  body: string;

  audience: ClassPostAudience;
  priority: ClassPostPriority;
  postType: ClassPostType;

  isPinned: boolean;

  publishedAt?: string | null;
  expiresAt?: string | null;
}

export interface UpdateClassPostInput {
  postId: string;
  title: string;
  body: string;

  audience: ClassPostAudience;
  priority: ClassPostPriority;
  postType: ClassPostType;

  isPinned: boolean;

  publishedAt: string;
  expiresAt?: string | null;
}