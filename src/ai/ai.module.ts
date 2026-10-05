import { Module, Global } from '@nestjs/common';
import { CommentPersonalizationClient } from './comment-personalization.client';
import { MessagePersonalizationClient } from './message-personalization.client';
import { ConnectionNoteClient } from './connection-note.client';
import { ActionWordsClient } from './action-words.client';
import { LeadScoreClient } from './lead-score.client';

@Global()
@Module({
  providers: [
    CommentPersonalizationClient,
    MessagePersonalizationClient,
    ConnectionNoteClient,
    ActionWordsClient,
    LeadScoreClient,
  ],
  exports: [
    CommentPersonalizationClient,
    MessagePersonalizationClient,
    ConnectionNoteClient,
    ActionWordsClient,
    LeadScoreClient,
  ],
})
export class AiModule {}