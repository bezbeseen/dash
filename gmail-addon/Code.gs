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
  if (from) {
    section.addWidget(CardService.newDecoratedText().setTopLabel('From').setText(from).setWrapText(true));
  }
  var labelDefault = subject === '(no subject)' ? '' : subject;
  section.addWidget(
    CardService.newTextInput()
      .setFieldName('ticketLabel')
      .setTitle('Ticket label')
      .setValue(labelDefault)
      .setHint('What this job is, e.g. memorial cards'),
  );
  section.addWidget(
    CardService.newTextParagraph().setText(
      'Creates a QuickBooks customer if needed and a saved (not sent) estimate. You stay in Gmail. If this thread is already a ticket, the next screen always has Create estimate anyway.',
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
  var ticketLabel = formString_(e, 'ticketLabel') || String(params.ticketLabel || '');
  var forceEstimate = String(params.forceEstimate || '') === 'true';
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
      followRedirects: true,
      headers: {
        Authorization: 'Bearer ' + props.secret,
        'X-Dash-Addon-Secret': props.secret,
      },
      payload: JSON.stringify({
        threadId: threadId,
        messageId: messageId,
        mailboxEmail: mailboxEmail,
        ticketLabel: ticketLabel,
        forceEstimate: forceEstimate,
        addonSecret: props.secret,
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
    return notify_(
      String(body.error || 'Dash rejected the add-on secret. Match Apps Script DASH_ADDON_SECRET to Vercel GMAIL_ADDON_SECRET (do not add DASH_ADDON_SECRET on Vercel).').slice(0, 200),
    );
  }
  if (code === 503) {
    return notify_(
      String(body.error || 'Set GMAIL_ADDON_SECRET on Vercel, then redeploy Dash. Do not create DASH_ADDON_SECRET on Vercel.').slice(0, 200),
    );
  }
  if (!body.ok) {
    return notify_(String(body.error || 'Could not create a ticket from this conversation.').slice(0, 200));
  }

  // Stay in Gmail: ignore body.openLink (and do not auto-open ticketUrl).
  var estimateCreated = bodyFlag_(body, 'estimateCreated');
  var existed = bodyFlag_(body, 'existed') || Boolean(body.existed);
  var restored = bodyFlag_(body, 'restored') || Boolean(body.restored);
  var heading = 'Ticket created';
  if (estimateCreated) heading = 'New estimate created on this ticket';
  else if (restored) heading = 'Ticket already on the board — restored';
  else if (existed) heading = 'Ticket already on the board';

  var resultLabel = bodyString_(body, 'ticketLabel') || ticketLabel;
  var ticketUrl = bodyString_(body, 'ticketUrl');
  // Exists / already / restored: always show Create estimate anyway. Never wait
  // for needsEstimate or canForceEstimate — a leftover QBO id is not “healthy”.
  var fromGmailExists = /[?&]from_gmail=exists(?:&|#|$)/i.test(ticketUrl);
  var alreadyOnBoard = !estimateCreated && (existed || restored || fromGmailExists);
  var card = buildTicketResultCard_({
    heading: heading,
    customerName: bodyString_(body, 'customerName'),
    ticketLabel: resultLabel,
    estimateNumber: bodyString_(body, 'estimateNumber'),
    ticketUrl: ticketUrl,
    qboError: bodyString_(body, 'qboError'),
    showAnyway: alreadyOnBoard,
    threadId: threadId,
    messageId: messageId,
    mailboxEmail: mailboxEmail,
  });

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(heading.slice(0, 200)))
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

function buildTicketResultCard_(opts) {
  var section = CardService.newCardSection();
  section.addWidget(CardService.newTextParagraph().setText('<b>' + opts.heading + '</b>'));

  if (opts.showAnyway) {
    var forceAction = CardService.newAction()
      .setFunctionName('createDashTicket')
      .setLoadIndicator(CardService.LoadIndicator.SPINNER)
      .setParameters({
        threadId: String(opts.threadId || ''),
        messageId: String(opts.messageId || ''),
        mailboxEmail: String(opts.mailboxEmail || ''),
        ticketLabel: String(opts.ticketLabel || ''),
        forceEstimate: 'true',
      });
    section.addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText('Create estimate anyway')
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setOnClickAction(forceAction),
      ),
    );
    section.addWidget(
      CardService.newTextParagraph().setText(
        'Saves a new numbered $0 estimate (not sent) on this same ticket. Use this if the old QuickBooks estimate was deleted.',
      ),
    );
  }

  if (opts.customerName) {
    section.addWidget(
      CardService.newDecoratedText().setTopLabel('Customer').setText(opts.customerName).setWrapText(true),
    );
  }
  if (opts.ticketLabel) {
    section.addWidget(
      CardService.newDecoratedText().setTopLabel('Label').setText(opts.ticketLabel).setWrapText(true),
    );
  }
  if (opts.estimateNumber) {
    section.addWidget(
      CardService.newDecoratedText().setTopLabel('Estimate').setText(opts.estimateNumber).setWrapText(true),
    );
  }
  if (opts.qboError) {
    section.addWidget(CardService.newTextParagraph().setText('QuickBooks: ' + clip_(opts.qboError, 180)));
  }
  if (opts.ticketUrl && /^https?:\/\//i.test(opts.ticketUrl)) {
    section.addWidget(
      CardService.newTextButton()
        .setText('Open in Dash')
        .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
        .setOpenLink(
          CardService.newOpenLink()
            .setUrl(opts.ticketUrl)
            .setOpenAs(CardService.OpenAs.FULL_SIZE)
            .setOnClose(CardService.OnClose.NOTHING),
        ),
    );
  }
  return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Dash')).addSection(section).build();
}

function bodyString_(body, key) {
  if (!body || body[key] == null) return '';
  return String(body[key]).replace(/\s+/g, ' ').trim();
}

function bodyFlag_(body, key) {
  var v = body && body[key];
  if (v === true || v === 1) return true;
  if (typeof v === 'string' && /^(true|1|yes)$/i.test(v)) return true;
  return false;
}

function buildSimpleCard_(body) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Dash'))
    .addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(body)))
    .build();
}

function formString_(e, fieldName) {
  var formInput = (e && e.formInput) || {};
  if (formInput[fieldName] != null && String(formInput[fieldName]).trim()) {
    return String(formInput[fieldName]).trim();
  }
  var formInputs = (e && e.formInputs) || {};
  var v = formInputs[fieldName];
  if (Object.prototype.toString.call(v) === '[object Array]' && v.length) {
    return String(v[0] || '').trim();
  }
  if (v != null && String(v).trim()) return String(v).trim();
  var common = e && e.commonEventObject && e.commonEventObject.formInputs;
  var entry = common && common[fieldName];
  var vals = entry && entry.stringInputs && entry.stringInputs.value;
  if (vals && vals.length) return String(vals[0] || '').trim();
  return '';
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
