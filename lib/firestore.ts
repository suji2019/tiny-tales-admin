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
  private stepsCollection: string;
  private subStoriesCollection: string;

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
    this.stepsCollection = `${collectionPrefix}_processing_steps`;
    this.subStoriesCollection = `${collectionPrefix}_sub_stories`;
    
    console.log(`Firestore initialized: project=${this.projectId}, collections=${this.booksCollection}, ${this.chaptersCollection}, ${this.pagesCollection}, ${this.stepsCollection}, ${this.subStoriesCollection}`);
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

  async createBook(bookData: Partial<FirestoreBook>): Promise<FirestoreBook> {
    const docRef = this.db.collection(this.booksCollection).doc();
    const book = {
      title: bookData.title || '',
      safe_title: bookData.safe_title || '',
      chapter_count: bookData.chapter_count || 0,
      status: bookData.status || 'pending',
      gcs_base_url: bookData.gcs_base_url,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
    
    await docRef.set(book);
    
    return {
      id: docRef.id,
      ...book,
    } as FirestoreBook;
  }

  async upsertBook(safeTitle: string, bookData: Partial<FirestoreBook>): Promise<FirestoreBook> {
    // Try to find existing book
    const existingBook = await this.getBookBySafeTitle(safeTitle);
    
    if (existingBook) {
      // Update existing book
      await this.updateBook(existingBook.id, {
        ...bookData,
        safe_title: safeTitle, // Ensure safe_title is set
      });
      return {
        ...existingBook,
        ...bookData,
        safe_title: safeTitle,
      } as FirestoreBook;
    } else {
      // Create new book
      return await this.createBook({
        ...bookData,
        safe_title: safeTitle,
        title: bookData.title || safeTitle.replace(/_/g, ' '), // Convert safe_title to readable title if not provided
      });
    }
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

  async createChapter(chapterData: Partial<FirestoreChapter>): Promise<FirestoreChapter> {
    const docRef = this.db.collection(this.chaptersCollection).doc();
    const chapter = {
      book_id: chapterData.book_id || '',
      title: chapterData.title || '',
      order_index: chapterData.order_index || 0,
      narration_version: chapterData.narration_version || '',
      processing_status: chapterData.processing_status || 'pending',
      audio_path: chapterData.audio_path,
      audio_gcs_key: chapterData.audio_gcs_key,
      audio_url: chapterData.audio_url,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
    
    await docRef.set(chapter);
    
    return {
      id: docRef.id,
      ...chapter,
    } as FirestoreChapter;
  }

  async upsertChapter(bookId: string, chapterTitle: string, chapterData: Partial<FirestoreChapter>): Promise<FirestoreChapter> {
    // Try to find existing chapter by book_id and title
    const chapters = await this.getChaptersByBookId(bookId);
    const existingChapter = chapters.find(c => c.title === chapterTitle);
    
    if (existingChapter) {
      // Update existing chapter
      await this.updateChapter(existingChapter.id, {
        ...chapterData,
        title: chapterTitle,
      });
      return {
        ...existingChapter,
        ...chapterData,
        title: chapterTitle,
      } as FirestoreChapter;
    } else {
      // Create new chapter
      const orderIndex = chapters.length; // Use current chapter count as order_index
      return await this.createChapter({
        ...chapterData,
        book_id: bookId,
        title: chapterTitle,
        order_index: orderIndex,
      });
    }
  }

  // ========== Page Operations ==========

  async getPagesByChapterId(chapterId: string): Promise<FirestorePage[]> {
    // First get all pages for the chapter (without orderBy to avoid index requirement)
    // Note: Pages might be linked via sub_story_id in the new schema, but we'll also check chapter_id for backward compatibility
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

  // ========== SubStory Operations ==========

  async getSubStoriesByChapterId(chapterId: string): Promise<any[]> {
    try {
      const snapshot = await this.db
        .collection(this.subStoriesCollection)
        .where('chapter_id', '==', chapterId)
        .get();

      const subStories = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as any[];
      
      // Sort by sub_story_number
      subStories.sort((a: any, b: any) => (a.sub_story_number || 0) - (b.sub_story_number || 0));
      
      return subStories;
    } catch (error: any) {
      // Collection might not exist (backward compatibility)
      console.warn(`Sub-stories collection not found or error: ${error.message}`);
      return [];
    }
  }

  async getPagesBySubStoryId(subStoryId: string): Promise<FirestorePage[]> {
    try {
      const snapshot = await this.db
        .collection(this.pagesCollection)
        .where('sub_story_id', '==', subStoryId)
        .get();

      const pages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as FirestorePage));
      
      // Sort by page_number
      pages.sort((a, b) => (a.page_number || 0) - (b.page_number || 0));
      
      return pages;
    } catch (error: any) {
      console.warn(`Error getting pages for sub-story ${subStoryId}: ${error.message}`);
      return [];
    }
  }

  async upsertSubStory(
    chapterId: string,
    subStoryNumber: number,
    subStoryData: { title?: string; content?: string }
  ): Promise<any> {
    try {
      console.log(`Upserting sub-story: chapter=${chapterId} (type: ${typeof chapterId}), number=${subStoryNumber}`, {
        title: subStoryData.title?.substring(0, 50),
        contentLength: subStoryData.content?.length || 0
      });
      
      // Validate chapterId
      if (!chapterId || typeof chapterId !== 'string') {
        throw new Error(`Invalid chapterId: ${chapterId} (type: ${typeof chapterId})`);
      }
      
      // Try to find existing sub-story
      const snapshot = await this.db
        .collection(this.subStoriesCollection)
        .where('chapter_id', '==', chapterId)
        .where('sub_story_number', '==', subStoryNumber)
        .limit(1)
        .get();

      // Ensure content is a string (not undefined or null)
      const contentValue = subStoryData.content !== undefined && subStoryData.content !== null 
        ? String(subStoryData.content) 
        : '';
      
      const subStory = {
        chapter_id: chapterId,
        sub_story_number: subStoryNumber,
        title: subStoryData.title || '',
        content: contentValue, // Ensure content is always a string
        updated_at: FieldValue.serverTimestamp(),
      };
      
      console.log(`Prepared sub-story data:`, {
        chapter_id: chapterId,
        sub_story_number: subStoryNumber,
        title_length: subStory.title.length,
        content_length: subStory.content.length,
        content_type: typeof subStory.content
      });

      if (!snapshot.empty) {
        // Update existing
        const docRef = snapshot.docs[0].ref;
        const docId = docRef.id;
        console.log(`Updating existing sub-story: ${docId}`);
        await docRef.update(subStory);
        console.log(`✅ Updated sub-story ${docId} with content (${subStory.content.length} chars)`);
        
        // Return a clean object with explicit id field (no Firestore special types)
        const result = {
          id: docId,
          chapter_id: chapterId,
          sub_story_number: subStoryNumber,
          title: subStory.title,
          content: subStory.content,
        };
        console.log(`Returning result:`, { id: result.id, hasId: !!result.id, contentLength: result.content.length });
        return result;
      } else {
        // Create new
        const newSubStory = {
          ...subStory,
          created_at: FieldValue.serverTimestamp(),
        };
        const docRef = this.db.collection(this.subStoriesCollection).doc();
        const docId = docRef.id;
        console.log(`Creating new sub-story: ${docId}`);
        await docRef.set(newSubStory);
        console.log(`✅ Created sub-story ${docId} with content (${newSubStory.content.length} chars)`);
        
        // Return a clean object with explicit id field (no Firestore special types)
        const result = {
          id: docId,
          chapter_id: chapterId,
          sub_story_number: subStoryNumber,
          title: newSubStory.title,
          content: newSubStory.content,
        };
        console.log(`Returning result:`, { id: result.id, hasId: !!result.id, contentLength: result.content.length });
        return result;
      }
    } catch (error: any) {
      console.error(`❌ Error upserting sub-story:`, {
        chapterId,
        subStoryNumber,
        errorMessage: error.message,
        errorCode: error.code,
        errorStack: error.stack
      });
      
      // Provide more helpful error messages
      if (error.code === 'permission-denied') {
        throw new Error('Permission denied: Check Firestore security rules');
      } else if (error.code === 'not-found') {
        throw new Error('Collection not found: Sub-stories collection may not exist');
      } else {
        throw new Error(`Failed to save sub-story: ${error.message || 'Unknown error'}`);
      }
    }
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

  async createPage(pageData: Partial<FirestorePage>): Promise<FirestorePage> {
    const docRef = this.db.collection(this.pagesCollection).doc();
    const page = {
      chapter_id: pageData.chapter_id || '',
      page_number: pageData.page_number || 0,
      illustration_prompt: pageData.illustration_prompt || '',
      dialogue: pageData.dialogue || '',
      image_gcs_key: pageData.image_gcs_key,
      image_url: pageData.image_url,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
    
    await docRef.set(page);
    
    return {
      id: docRef.id,
      ...page,
    } as FirestorePage;
  }

  async upsertPage(chapterId: string, pageNumber: number, pageData: Partial<FirestorePage>): Promise<FirestorePage> {
    // Try to find existing page by chapter_id and page_number
    const pages = await this.getPagesByChapterId(chapterId);
    const existingPage = pages.find(p => p.page_number === pageNumber);
    
    if (existingPage) {
      // Update existing page
      await this.updatePage(existingPage.id, {
        ...pageData,
        page_number: pageNumber,
      });
      return {
        ...existingPage,
        ...pageData,
        page_number: pageNumber,
      } as FirestorePage;
    } else {
      // Create new page
      return await this.createPage({
        ...pageData,
        chapter_id: chapterId,
        page_number: pageNumber,
      });
    }
  }

  // ========== Processing Step Operations ==========

  async getProcessingStepsByBookId(bookId: string): Promise<any[]> {
    const snapshot = await this.db
      .collection(this.stepsCollection)
      .where('book_id', '==', bookId)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  async getProcessingStepsBySafeTitle(safeTitle: string): Promise<any[]> {
    const book = await this.getBookBySafeTitle(safeTitle);
    if (!book) {
      return [];
    }
    return this.getProcessingStepsByBookId(book.id);
  }

  async updateProcessingStep(stepId: string, updates: Partial<any>): Promise<void> {
    await this.db
      .collection(this.stepsCollection)
      .doc(stepId)
      .update({
        ...updates,
        updated_at: FieldValue.serverTimestamp(),
      });
  }

  async cancelProcessingStepsByBookId(bookId: string): Promise<number> {
    const steps = await this.getProcessingStepsByBookId(bookId);
    const inProgressSteps = steps.filter(
      step => step.status === 'in_progress' || step.status === 'processing'
    );

    const batch = this.db.batch();
    inProgressSteps.forEach(step => {
      const stepRef = this.db.collection(this.stepsCollection).doc(step.id);
      batch.update(stepRef, {
        status: 'cancelled',
        error_message: 'Pipeline stopped by user',
        updated_at: FieldValue.serverTimestamp(),
      });
    });

    if (inProgressSteps.length > 0) {
      await batch.commit();
    }

    return inProgressSteps.length;
  }

  async deleteProcessingStepsByBookId(bookId: string): Promise<void> {
    const steps = await this.getProcessingStepsByBookId(bookId);
    const batch = this.db.batch();
    
    steps.forEach(step => {
      const stepRef = this.db.collection(this.stepsCollection).doc(step.id);
      batch.delete(stepRef);
    });
    
    await batch.commit();
  }

  async deletePagesByChapterId(chapterId: string): Promise<void> {
    const pages = await this.getPagesByChapterId(chapterId);
    const batch = this.db.batch();
    
    pages.forEach(page => {
      const pageRef = this.db.collection(this.pagesCollection).doc(page.id);
      batch.delete(pageRef);
    });
    
    await batch.commit();
  }

  async deleteChaptersByBookId(bookId: string): Promise<void> {
    const chapters = await this.getChaptersByBookId(bookId);
    const batch = this.db.batch();
    
    // Delete all pages for each chapter first
    for (const chapter of chapters) {
      await this.deletePagesByChapterId(chapter.id);
      const chapterRef = this.db.collection(this.chaptersCollection).doc(chapter.id);
      batch.delete(chapterRef);
    }
    
    await batch.commit();
  }

  async deleteBook(safeTitle: string): Promise<void> {
    const book = await this.getBookBySafeTitle(safeTitle);
    if (!book) {
      throw new Error(`Book not found: ${safeTitle}`);
    }

    // Delete all related data
    await this.deleteProcessingStepsByBookId(book.id);
    await this.deleteChaptersByBookId(book.id);
    
    // Finally delete the book
    await this.db.collection(this.booksCollection).doc(book.id).delete();
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
                    content: subStory.content || '', // Mini story content
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
      
      // Fallback: Load from Firestore (reconstruct sections from pages and sub_stories)
      const book = await this.getBookBySafeTitle(safeTitle);
      if (!book) {
        console.log(`Book not found: ${safeTitle}`);
        return null;
      }

      console.log(`Found book: ${book.title} (ID: ${book.id})`);
      const chapters = await this.getChaptersByBookId(book.id);
      console.log(`Found ${chapters.length} chapters for book ${book.id}`);

      // Load chapters with sub_stories and pages
      const chaptersWithData = await Promise.all(
        chapters.map(async (chapter) => {
          try {
            // Try to load sub_stories first (new schema)
            const subStories = await this.getSubStoriesByChapterId(chapter.id);
            console.log(`Found ${subStories.length} sub-stories for chapter ${chapter.id}`);
            
            if (subStories.length > 0) {
              // New schema: Load pages for each sub-story
              const subStoriesWithPages = await Promise.all(
                subStories.map(async (subStory) => {
                  const pages = await this.getPagesBySubStoryId(subStory.id);
                  return {
                    ...subStory,
                    pages,
                    // Ensure content field is included
                    content: subStory.content || '',
                  };
                })
              );
              
              return {
                ...chapter,
                sub_stories: subStoriesWithPages,
              };
            } else {
              // Old schema: Load pages directly from chapter
              const pages = await this.getPagesByChapterId(chapter.id);
              console.log(`Found ${pages.length} pages for chapter ${chapter.id} (old schema)`);
              return {
                ...chapter,
                pages,
              };
            }
          } catch (error: any) {
            console.error(`Error getting data for chapter ${chapter.id}:`, error);
            return {
              ...chapter,
              pages: [],
              sub_stories: [],
            };
          }
        })
      );

      // Transform to match the frontend StoryBook format
      const result = {
        book_title: book.title,
        chapter_count: book.chapter_count,
        chapters: chaptersWithData.map((chapter: any) => {
          // Check if we have sub_stories (new schema)
          if (chapter.sub_stories && chapter.sub_stories.length > 0) {
            // New format: sub_stories with pages
            return {
              id: chapter.id,
              title: chapter.title,
              book_title: book.title,
              narration_version: chapter.narration_version || '',
              reading_version: {
                sub_stories: chapter.sub_stories.map((subStory: any) => {
                  // Get pages from subStory.pages (loaded from Firestore) or subStory.sections (from JSON)
                  const pages = subStory.pages || []
                  const sections = subStory.sections || []
                  
                  return {
                    sub_story_number: subStory.sub_story_number || 0,
                    title: subStory.title || '',
                    content: subStory.content || '', // Mini story content
                    sections: pages.length > 0 
                      ? pages.map((page: any) => ({
                          page_number: page.page_number || 0,
                          illustration_prompt: page.illustration_prompt || '',
                          dialogue: page.dialogue || '',
                          illustration_image: page.image_url || page.image_gcs_key || '',
                        }))
                      : sections.map((section: any) => ({
                          page_number: section.page_number || 0,
                          illustration_prompt: section.illustration_prompt || '',
                          dialogue: section.dialogue || '',
                          illustration_image: section.image_url || section.image_gcs_key || section.illustration_image || '',
                        })),
                  };
                }),
              },
              content: chapter.narration_version || '',
            };
          } else {
            // Old format: direct sections from pages
            const pages = chapter.pages || [];
            const sections = pages.map((page: any) => ({
              page_number: page.page_number || 0,
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
          }
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

