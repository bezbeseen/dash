import { YELP_SCAN_DEFAULT_LOOKBACK_DAYS } from '@/lib/yelp/scan-limits';

type Props = {
  returnTo: string;
  disabled?: boolean;
  disabledReason?: string;
};

/** Imports new Yelp lead emails as pre-quote tickets (same scan as Settings). */
export function YelpSyncButton({ returnTo, disabled = false, disabledReason }: Props) {
  return (
    <form
      action={`/api/integrations/yelp/scan-emails?days=${YELP_SCAN_DEFAULT_LOOKBACK_DAYS}`}
      method="post"
      className="d-inline"
    >
      <input type="hidden" name="return_to" value={returnTo} />
      <button
        className="btn btn-yelp"
        type="submit"
        disabled={disabled}
        title={
          disabled
            ? disabledReason || 'Connect the Yelp lead mailbox in Settings first'
            : 'Import new Yelp lead emails as pre-quote tickets'
        }
      >
        Sync Yelp
      </button>
    </form>
  );
}
