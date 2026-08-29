import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Printer extends Model {
  static table = 'printers';

  @field('uuid') uuid!: string;
  @field('name') name!: string;
}
