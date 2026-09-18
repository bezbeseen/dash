/**
 * Dash Gmail add-on — Create ticket from the open conversation.
 * Uses e.gmail.threadId / messageId (API ids). Script properties:
 *   DASH_BASE_URL      production https origin, no trailing slash
 *   DASH_ADDON_SECRET  same value as Vercel GMAIL_ADDON_SECRET
 */

function onGmailHomepage() {
  return buildSimpleCard_(
    'Open a conversation, then Create ticket. That saves a QuickBooks customer if needed and a $0 estimate (not sent).',
  );
}

function onGmailMessageOpen(e) {
  var meta = (e && e.gmail) || {};
  var accessToken = meta.accessToken || '';
  var messageId = String(meta.messageId || '');
  var threadId = String(meta.threadId || '');
  var mailbox = activeMailboxEmail_();
  var subject = '(no subject)';
  var from = '';

  if (accessToken && messageId) {
    try {
      GmailApp.setCurrentMessageAccessToken(accessToken);
      var msg = GmailApp.getMessageById(messageId);
      subject = clip_(msg.getSubject(), 180) || subject;
      from = clip_(msg.getFrom(), 180);
      if (!threadId && msg.getThread()) threadId = String(msg.getThread().getId() || '');
    } catch (err) {
      // Card still works; Create ticket sends the ids Gmail already gave us.
    }
  }

  var props = dashProps_();
  var section = CardService.newCardSection();
  section.addWidget(CardService.newDecoratedText().setTopLabel('Subject').setText(subject).setWrapText(true));
  if (from) {
    section.addWidget(CardService.newDecoratedText().setTopLabel('From').setText(from).setWrapText(true));
  }
  section.addWidget(
    CardService.newTextParagraph().setText(
      'Creates a QuickBooks customer if needed and a saved (not sent) estimate, then opens Dash.',
    ),
  );

  if (!props.ok) {
    section.addWidget(
      CardService.newTextParagraph().setText(
        'Set Script properties DASH_BASE_URL and DASH_ADDON_SECRET (Project Settings), then try again.',
      ),
    );
  } else {
    var action = CardService.newAction()
      .setFunctionName('createDashTicket')
      .setLoadIndicator(CardService.LoadIndicator.SPINNER)
      .setParameters({
        threadId: threadId,
        messageId: messageId,
        mailboxEmail: mailbox,
      });
    section.addWidget(
      CardService.newTextButton()
        .setText('Create ticket')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(action),
    );
  }

  return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Dash')).addSection(section).build();
}

function createDashTicket(e) {
  var params = (e && e.parameters) || {};
  var threadId = String(params.threadId || '');
  var messageId = String(params.messageId || '');
  var mailboxEmail = String(params.mailboxEmail || activeMailboxEmail_());
  var props = dashProps_();

  if (!props.ok) {
    return notify_('Set Script properties DASH_BASE_URL and DASH_ADDON_SECRET.');
  }
  if (!threadId && !messageId) {
    return notify_('Gmail did not send a thread id for this conversation.');
  }

  var url = props.baseUrl + '/api/integrations/gmail-addon/create-ticket';
  var res;
  try {
    res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + props.secret },
      payload: JSON.stringify({
        threadId: threadId,
        messageId: messageId,
        mailboxEmail: mailboxEmail,
      }),
    });
  } catch (err) {
    return notify_('Could not reach Dash. Check DASH_BASE_URL.');
  }

  var code = res.getResponseCode();
  var body = {};
  try {
    body = JSON.parse(res.getContentText() || '{}');
  } catch (parseErr) {
    return notify_('Dash returned a non-JSON response (' + code + ').');
  }

  if (code === 401) {
    return notify_('Dash rejected the add-on secret. Match DASH_ADDON_SECRET to GMAIL_ADDON_SECRET on Vercel.');
  }
  if (code === 503) {
    return notify_('Set GMAIL_ADDON_SECRET on Vercel, then redeploy Dash.');
  }
  if (!body.ok) {
    return notify_(String(body.error || 'Could not create a ticket from this conversation.').slice(0, 200));
  }

  var ticketUrl = String(body.ticketUrl || '');
  var text = 'Ticket created. Opening Dash.';
  if (body.existed) text = 'This conversation is already a Dash ticket.';
  else if (body.qboError) text = 'Ticket created. QuickBooks: ' + String(body.qboError).slice(0, 140);
  else if (body.usedQuickBooks) text = 'Ticket created with a saved estimate. Opening Dash.';

  var builder = CardService.newActionResponseBuilder().setNotification(
    CardService.newNotification().setText(text),
  );
  if (ticketUrl) {
    builder.setOpenLink(
      CardService.newOpenLink()
        .setUrl(ticketUrl)
        .setOpenAs(CardService.OpenAs.FULL_SIZE)
        .setOnClose(CardService.OnClose.NOTHING),
    );
  }
  return builder.build();
}

function buildSimpleCard_(body) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Dash'))
    .addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(body)))
    .build();
}

function dashProps_() {
  var p = PropertiesService.getScriptProperties();
  var baseUrl = String(p.getProperty('DASH_BASE_URL') || '')
    .trim()
    .replace(/\/+$/, '');
  var secret = String(p.getProperty('DASH_ADDON_SECRET') || '').trim();
  return { ok: Boolean(baseUrl && secret), baseUrl: baseUrl, secret: secret };
}

function activeMailboxEmail_() {
  try {
    var active = Session.getActiveUser() && Session.getActiveUser().getEmail();
    if (active) return String(active);
  } catch (e1) {}
  try {
    var effective = Session.getEffectiveUser() && Session.getEffectiveUser().getEmail();
    if (effective) return String(effective);
  } catch (e2) {}
  return '';
}

function notify_(text) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(String(text).slice(0, 200)))
    .build();
}

function clip_(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
