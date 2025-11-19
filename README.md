# Tiny Tales Admin

Admin interface for managing Tiny Tales storybooks, chapters, and illustrations.

## Features

- 📚 View all books from Firestore
- ✏️ Edit chapter narration text
- 🖼️ Edit page dialogue and illustrations
- 📤 Upload images to Google Cloud Storage
- 💾 Save changes back to Firestore
- 🔄 Pipeline Management: Re-run pipeline to regenerate content or illustrations

## Setup

### Prerequisites

- Node.js 18+ 
- GCP Project with Firestore and Cloud Storage enabled
- Google Cloud credentials configured

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up configuration:

**Using config file (Recommended)**

The admin module uses `config/config.yaml` for configuration. A template file `config/config.yaml.example` is provided.

**Important:** The `collection_prefix` in `config/config.yaml` must match the `firestore_collection_prefix` in the pipeline's `config/config.yaml` file (default is `tiny_tales`).

If you haven't created `config/config.yaml` yet, you can:

1. Copy the example file:
```bash
cp config/config.yaml.example config/config.yaml
```

2. Or create it manually with this content:

```yaml
admin:
  firestore:
    project_id: ""  # Leave empty to use GOOGLE_CLOUD_PROJECT env var
    collection_prefix: "tiny_tales"  # MUST match pipeline config/config.yaml
  gcs:
    bucket: ""  # Leave empty to use GCS_BUCKET env var
    project_id: ""  # Leave empty to use GOOGLE_CLOUD_PROJECT env var
  pubsub:
    topic: "tiny-tales-books-topic"  # Leave empty to use PUBSUB_TOPIC env var
    project_id: ""  # Leave empty to use GOOGLE_CLOUD_PROJECT env var
```

3. Set required environment variables in `.env.local`:

```bash
# Required: GCP Project ID
GOOGLE_CLOUD_PROJECT=your-project-id

# Required: GCS Bucket
GCS_BUCKET=your-bucket-name

# Optional: For local Firestore emulator
# FIRESTORE_EMULATOR_HOST=localhost:8080
```

**Note:** If you leave fields empty in `config/config.yaml`, they will fall back to environment variables. The `collection_prefix` in admin config must exactly match the `firestore_collection_prefix` in the pipeline's `config/config.yaml` (both default to `tiny_tales`).

3. Set up Google Cloud credentials:

The application uses Application Default Credentials (ADC). You can set this up by:

```bash
# Option 1: Use gcloud CLI
gcloud auth application-default login

# Option 2: Set GOOGLE_APPLICATION_CREDENTIALS environment variable
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json
```

### Running the Application

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

## Architecture

### Data Flow

1. **Reading Data**: 
   - Frontend → API Routes → Firestore Client → Firestore Database
   - Reads books, chapters, and pages from Firestore

2. **Editing Data**:
   - Frontend → API Routes → Firestore Client → Firestore Database
   - Updates chapter narration, page dialogue, and illustration prompts

3. **Image Upload**:
   - Frontend → Upload API → GCS Client → Google Cloud Storage
   - Returns public URL → Saved to Firestore page document

### Data Structure

The admin module works with the following Firestore collections:

- `tiny_tales_books`: Book metadata
- `tiny_tales_chapters`: Chapter data with narration_version
- `tiny_tales_pages`: Page data with dialogue and image_url

### API Routes

- `GET /api/books` - List all books
- `GET /api/books/[filename]` - Get book with chapters and pages
- `PUT /api/books/[filename]` - Update book (chapters and pages)
- `POST /api/upload` - Upload image to GCS
- `GET /api/images/[...path]` - Serve/redirect to GCS images
- `POST /api/pipeline/trigger` - Trigger pipeline re-run (content or illustrations)

## Usage

### Book Editing

1. Navigate to the home page to see all available books
2. Click on a book to open the editor
3. Select a chapter and page to edit
4. Edit the narration text, dialogue, or illustration prompt
5. Upload new images by clicking on the image area
6. Click "Save Changes" to persist updates to Firestore

### Pipeline Management

1. Click "🔄 Pipeline Management" button on the home page
2. Select a book from the list
3. Choose an action:
   - **📝 Regenerate Content**: Re-runs the content simplification pipeline to regenerate narration and reading versions (includes audio regeneration)
   - **🖼️ Regenerate Illustrations**: Re-generates all illustrations and recompiles the storybook
4. The task will be submitted to Pub/Sub and processed asynchronously by the pipeline worker
5. Check the pipeline worker logs to see the processing status

## Development

### Project Structure

```
tiny-tales-admin/
├── app/
│   ├── api/              # API routes
│   ├── books/           # Book editor pages
│   └── page.tsx         # Home page
├── components/          # React components
├── lib/                 # Utility libraries
│   ├── firestore.ts     # Firestore client
│   └── gcs.ts           # GCS client
└── types/               # TypeScript types
```

## Troubleshooting

### Authentication Errors

If you see authentication errors, make sure:
- `GOOGLE_CLOUD_PROJECT` is set correctly
- Google Cloud credentials are configured (ADC or service account)
- The service account has Firestore and Storage permissions

### Image Upload Fails

- Check that `GCS_BUCKET` is set correctly
- Verify the bucket exists and is accessible
- Ensure the service account has Storage Admin or Object Admin permissions

### Firestore Connection Issues

- Verify Firestore is enabled in your GCP project
- Check that the collection prefix matches (`tiny_tales` by default)
- For local development, set `FIRESTORE_EMULATOR_HOST` if using the emulator

### Pipeline Management Issues

- Ensure `PUBSUB_TOPIC` environment variable is set correctly
- Verify the Pub/Sub topic exists in your GCP project
- Make sure the pipeline worker is running and subscribed to the topic
- Check that the service account has Pub/Sub Publisher permissions
# tiny-tales-admin
