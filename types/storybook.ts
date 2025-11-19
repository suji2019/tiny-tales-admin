export interface PageSection {
  page_number: number;
  illustration_prompt: string;
  dialogue: string;
  illustration_image?: string; // Path to uploaded illustration
}

export interface SubStory {
  sub_story_number: number;
  title: string;
  sections: PageSection[];
}

export interface ReadingVersion {
  // New format: sub_stories structure
  sub_stories?: SubStory[];
  // Old format: direct sections (for backward compatibility)
  sections?: PageSection[];
}

export interface Chapter {
  id?: string;
  title: string;
  book_title: string;
  narration_version: string;
  reading_version: ReadingVersion;
  content: string;
}

export interface StoryBook {
  book_title: string;
  chapter_count: number;
  chapters: Chapter[];
}

export interface BookFile {
  filename: string;
  book_title: string;
  chapter_count: number;
}

