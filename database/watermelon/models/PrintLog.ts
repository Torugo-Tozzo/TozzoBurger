import { Model } from '@nozbe/watermelondb';
import { date, field } from '@nozbe/watermelondb/decorators';

export default class PrintLog extends Model {
  static table = 'print_logs';

  @field('device_id') deviceId!: string;
  @date('printed_at') printedAt!: Date;
  @field('establishment_id') establishmentId!: string;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
