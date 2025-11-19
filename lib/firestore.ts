import { Firestore, FieldValue } from '@google-cloud/firestore';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface FirestoreBook {
  id: string;
  title: string;
  safe_title: string;
  chapter_count: number;
  status: string;
  gcs_base_url?: string;
  created_at?: any;
  updated_at?: any;
}

export interface FirestoreChapter {
  id: string;
  book_id: string;
  title: string;
  order_index: number;
  narration_version?: string;
  processing_status: string;
  audio_path?: string;
  audio_gcs_key?: string;
  audio_url?: string;
  created_at?: any;
  updated_at?: any;
}

export interface FirestorePage {
  id: string;
  chapter_id: string;
  page_number: number;
  illustration_prompt?: string;
  dialogue?: string;
  image_gcs_key?: string;
  image_url?: string;
  created_at?: any;
  updated_at?: any;
}

class FirestoreClient {
  private db: Firestore;
  private projectId: string;
  private booksCollection: string;
  private chaptersCollection: string;
  private pagesCollection: string;

  constructor() {
    // Load config to get project ID and collection prefix
    const configPath = path.join(process.cwd(), 'config', 'config.yaml');
    let config: any = {};
    
    try {
      if (fs.existsSync(configPath)) {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        config = yaml.load(fileContents) || {};
      }
    } catch (error) {
      console.warn('Failed to load config file, using environment variables:', error);
    }
    
    // Get project ID from config or environment variable
    this.projectId = 
      config?.admin?.firestore?.project_id ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      '';
    
    if (!this.projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable or config file is required');
    }

    // Get collection prefix from config or environment variable, default to 'tiny_tales'
    const collectionPrefix = 
      config?.admin?.firestore?.collection_prefix ||
      process.env.FIRESTORE_COLLECTION_PREFIX ||
      'tiny_tales';

    // Check if using emulator
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    if (emulatorHost) {
      console.log(`Using Firestore emulator: ${emulatorHost}`);
    }

    this.db = new Firestore({
      projectId: this.projectId,
    });

    this.booksCollection = `${collectionPrefix}_books`;
    this.chaptersCollection = `${collectionPrefix}_chapters`;
    this.pagesCollection = `${collectionPrefix}_pages`;
    
    console.log(`Firestore initialized: project=${this.projectId}, collections=${this.booksCollection}, ${this.chaptersCollection}, ${this.pagesCollection}`);
  }

  // ========== Book Operations ==========

  async getAllBooks(): Promise<FirestoreBook[]> {
    const snapshot = await this.db.collection(this.booksCollection).get();
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as FirestoreBook));
  }

  async getBookBySafeTitle(safeTitle: string): Promise<FirestoreBook | null> {
    const snapshot = await this.db
      .collection(this.booksCollection)
      .where('safe_title', '==', safeTitle)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    } as FirestoreBook;
  }

  async updateBook(bookId: string, updates: Partial<FirestoreBook>): Promise<void> {
    await this.db
      .collection(this.booksCollection)
      .doc(bookId)
      .update({
        ...updates,
        updated_at: FieldValue.serverTimestamp(),
      });
  }

  // ========== Chapter Operations ==========

  async getChaptersByBookId(bookId: string): Promise<FirestoreChapter[]> {
    // First get all chapters for the book (without orderBy to avoid index requirement)
    const snapshot = await this.db
      .collection(this.chaptersCollection)
      .where('book_id', '==', bookId)
      .get();

    // Sort in memory
    const chapters = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as FirestoreChapter));
    
    // Sort by order_index
    chapters.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    
    return chapters;
  }

  async getChapterById(chapterId: string): Promise<FirestoreChapter | null> {
    const doc = await this.db.collection(this.chaptersCollection).doc(chapterId).get();
    if (!doc.exists) {
      return null;
    }
    return {
      id: doc.id,
      ...doc.data(),
    } as FirestoreChapter;
  }

  async updateChapter(chapterId: string, updates: Partial<FirestoreChapter>): Promise<void> {
    await this.db
      .collection(this.chaptersCollection)
      .doc(chapterId)
      .update({
        ...updates,
        updated_at: FieldValue.serverTimestamp(),
      });
  }

  // ========== Page Operations ==========

  async getPagesByChapterId(chapterId: string): Promise<FirestorePage[]> {
    // First get all pages for the chapter (without orderBy to avoid index requirement)
    const snapshot = await this.db
      .collection(this.pagesCollection)
      .where('chapter_id', '==', chapterId)
      .get();

    // Sort in memory
    const pages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as FirestorePage));
    
    // Sort by page_number
    pages.sort((a, b) => (a.page_number || 0) - (b.page_number || 0));
    
    return pages;
  }

  async getPageById(pageId: string): Promise<FirestorePage | null> {
    const doc = await this.db.collection(this.pagesCollection).doc(pageId).get();
    if (!doc.exists) {
      return null;
    }
    return {
      id: doc.id,
      ...doc.data(),
    } as FirestorePage;
  }

  async updatePage(pageId: string, updates: Partial<FirestorePage>): Promise<void> {
    await this.db
      .collection(this.pagesCollection)
      .doc(pageId)
      .update({
        ...updates,
        updated_at: FieldValue.serverTimestamp(),
      });
  }

  // ========== Helper: Load JSON from GCS or Local ==========

  private async loadBookJSON(safeTitle: string): Promise<any | null> {
    try {
      // Try to load from GCS first
      const projectId = this.projectId;
      const bucketName = 
        process.env.GCS_BUCKET || 
        '';
      
      if (bucketName && projectId) {
        try {
          // Dynamic import to avoid issues during module initialization
          const { Storage } = await import('@google-cloud/storage');
          const storage = new Storage({
            projectId: projectId,
          });
          const bucket = storage.bucket(bucketName);
          const jsonKey = `books/${safeTitle}/chapters_final.json`;
          const file = bucket.file(jsonKey);
          
          const [exists] = await file.exists();
          if (exists) {
            const [contents] = await file.download();
            const jsonData = JSON.parse(contents.toString());
            console.log(`Loaded book JSON from GCS: ${jsonKey}`);
            return jsonData;
          }
        } catch (error: any) {
          console.warn(`Failed to load from GCS: ${error?.message || error}`);
        }
      }
      
      // Try to load from local file system
      const localPath = path.join(process.cwd(), '..', 'tiny-tales-pipeline', 'output', 'data', `${safeTitle}_chapters_final.json`);
      if (fs.existsSync(localPath)) {
        const contents = fs.readFileSync(localPath, 'utf8');
        const jsonData = JSON.parse(contents);
        console.log(`Loaded book JSON from local: ${localPath}`);
        return jsonData;
      }
      
      return null;
    } catch (error: any) {
      console.warn(`Failed to load book JSON: ${error?.message || error}`);
      return null;
    }
  }

  // ========== Helper: Get Full Book Data ==========

  async getBookWithChaptersAndPages(safeTitle: string): Promise<any> {
    try {
      // First, try to load from JSON file (contains full sub_stories structure)
      const jsonData = await this.loadBookJSON(safeTitle);
      if (jsonData) {
        // Transform JSON data to match frontend format
        const result = {
          book_title: jsonData.book_title || safeTitle,
          chapter_count: jsonData.chapter_count || 0,
          chapters: (jsonData.chapters || []).map((chapter: any) => {
            const readingVersion = chapter.reading_version || {};
            
            // Check if we have sub_stories structure
            if (readingVersion.sub_stories && Array.isArray(readingVersion.sub_stories)) {
              // New format: sub_stories
              return {
                id: chapter.id || '',
                title: chapter.title || '',
                book_title: jsonData.book_title || safeTitle,
                narration_version: chapter.narration_version || chapter.content || '',
                reading_version: {
                  sub_stories: readingVersion.sub_stories.map((subStory: any) => ({
                    sub_story_number: subStory.sub_story_number || 0,
                    title: subStory.title || '',
                    sections: (subStory.sections || []).map((section: any) => ({
                      page_number: section.page_number || 0,
                      illustration_prompt: section.illustration_prompt || '',
                      dialogue: section.dialogue || '',
                      illustration_image: section.image_url || section.image_gcs_key || '',
                    })),
                  })),
                },
                content: chapter.narration_version || chapter.content || '',
              };
            } else {
              // Old format: direct sections
              return {
                id: chapter.id || '',
                title: chapter.title || '',
                book_title: jsonData.book_title || safeTitle,
                narration_version: chapter.narration_version || chapter.content || '',
                reading_version: {
                  sections: (readingVersion.sections || []).map((section: any) => ({
                    page_number: section.page_number || 0,
                    illustration_prompt: section.illustration_prompt || '',
                    dialogue: section.dialogue || '',
                    illustration_image: section.image_url || section.image_gcs_key || '',
                  })),
                },
                content: chapter.narration_version || chapter.content || '',
              };
            }
          }),
        };
        
        console.log(`Returning book data from JSON with ${result.chapters.length} chapters`);
        return result;
      }
      
      // Fallback: Load from Firestore (reconstruct sections from pages)
      const book = await this.getBookBySafeTitle(safeTitle);
      if (!book) {
        console.log(`Book not found: ${safeTitle}`);
        return null;
      }

      console.log(`Found book: ${book.title} (ID: ${book.id})`);
      const chapters = await this.getChaptersByBookId(book.id);
      console.log(`Found ${chapters.length} chapters for book ${book.id}`);

      const chaptersWithPages = await Promise.all(
        chapters.map(async (chapter) => {
          try {
            const pages = await this.getPagesByChapterId(chapter.id);
            console.log(`Found ${pages.length} pages for chapter ${chapter.id}`);
            return {
              ...chapter,
              pages,
            };
          } catch (error: any) {
            console.error(`Error getting pages for chapter ${chapter.id}:`, error);
            return {
              ...chapter,
              pages: [],
            };
          }
        })
      );

      // Transform to match the frontend StoryBook format
      // Group pages by sub_story if they have sub_story metadata, otherwise use flat sections
      const result = {
        book_title: book.title,
        chapter_count: book.chapter_count,
        chapters: chaptersWithPages.map((chapter) => {
          const pages = chapter.pages || [];
          
          // Check if we should group by sub_story
          // For now, we'll use flat sections structure for backward compatibility
          // The frontend can handle both formats
          const sections = pages.map((page) => ({
            page_number: page.page_number,
            illustration_prompt: page.illustration_prompt || '',
            dialogue: page.dialogue || '',
            illustration_image: page.image_url || page.image_gcs_key || '',
          }));
          
          return {
            id: chapter.id,
            title: chapter.title,
            book_title: book.title,
            narration_version: chapter.narration_version || '',
            reading_version: {
              sections: sections,
            },
            content: chapter.narration_version || '',
          };
        }),
      };

      console.log(`Returning book data from Firestore with ${result.chapters.length} chapters`);
      return result;
    } catch (error: any) {
      console.error(`Error in getBookWithChaptersAndPages for ${safeTitle}:`, error);
      throw error;
    }
  }
}

// Singleton instance
let firestoreClient: FirestoreClient | null = null;

export function getFirestoreClient(): FirestoreClient {
  if (!firestoreClient) {
    firestoreClient = new FirestoreClient();
  }
  return firestoreClient;
}

