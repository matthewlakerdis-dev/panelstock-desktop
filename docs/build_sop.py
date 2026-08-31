from pathlib import Path
import shutil
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from PIL import Image

REPO_ROOT=Path(__file__).resolve().parents[1]
BASE=REPO_ROOT.parent
ASSETS=REPO_ROOT/'docs/sop'
NAVY=HexColor('#0f172a');TEAL=HexColor('#155e75');GRAY=HexColor('#525252')
BODY=ParagraphStyle('body',fontName='Helvetica',fontSize=9.5,leading=13.5,textColor=NAVY)
SMALL=ParagraphStyle('small',parent=BODY,fontSize=9,leading=11.5,textColor=GRAY)
TITLE=ParagraphStyle('title',fontName='Helvetica-Bold',fontSize=17,leading=21,textColor=NAVY)

# Titles and sequence follow the original SOP. New workflows are inserted where used.
PAGES=[
('2. Logging In & Registering','First time using PanelStock on this device','original-4-0.png','desktop-register.png',[
 'Open the app, then select <b>Register</b>.',
 'Enter your own <b>username</b>. Use a separate account for each staff member.',
 'Enter the current <b>six-digit registration code</b> supplied by an admin.',
 'Select <b>Continue</b>, then choose and confirm a unique <b>6-12 digit personal PIN</b>.'
],'Keep your personal PIN private. Never put it in job notes or share an admin login.',False),
('Returning after the app has logged you out','Use your own account so stock changes and CNC completions are attributed to you.','mobile-login.png','desktop-login.png',[
 'Select the <b>Log in</b> tab.',
 'Check the <b>username</b>. If changes are waiting to sync, sign in as the account that created them.',
 'Enter your personal <b>PIN</b> and select <b>Log in</b>. Ask an admin for a PIN reset if you have forgotten it.',
 'On a shared device, turn off <b>Remember my username</b> if appropriate and log out when finished.'
],'A saved username is not a shared account. Check the sync status before leaving the device.',False),
('3. Viewing Stock & Exporting Reports','Check stock on hand before taking or receiving material.','mobile-stock.png','desktop-stock.png',[
 'Open <b>{stock}</b>. Choose <b>Full panels</b> or <b>Off-cuts</b>.',
 'Search by colour, material, thickness, size or SKU. Check the exact item before using it.',
 'Read the displayed <b>SOH</b> and compare it with the physical stock. Report discrepancies for review.',
 'Use <b>Excel</b> or <b>PDF</b> to export a report. Ordinary stock exports are snapshots, not live workbooks.'
],'The shared CNC Excel workbook is different: it refreshes while open. See Section 16.',False),
('Adding an off-cut','Use this when a job leaves a usable leftover piece worth keeping in stock.','original-7-0.png','desktop-offcut.png',[
 'Open <b>{stock}</b>, choose <b>Off-cuts</b>, then select <b>Add off-cut</b>.',
 'Optionally select the original material to fill its details, or enter colour, material and thickness manually.',
 "Enter the offcut's own <b>Width</b> and <b>Height</b> - usually smaller than the original sheet.",
 'Enter the <b>Quantity</b> and an optional <b>Note</b>.',
 'Select <b>Add off-cut</b>. Scroll within the form if the button is below the visible area.'
],'Adding an offcut does not dispatch its parent sheet. Record that full-sheet movement separately.',False),
('4. Receiving Stock','Use this whenever new panels physically arrive at the warehouse.','mobile-receive.png','desktop-receive.png',[
 'Open <b>Receive</b> in the app navigation.',
 "Search for the material, colour, thickness or SKU, then select the exact item you're receiving.",
 'Optionally enter a <b>Supplier / PO reference</b>.',
 'Enter the <b>Quantity received</b> as a positive whole number.',
 'Select <b>Add to SOH</b>. Check the new total and the sync indicator.'
],"If the material is not in the catalog, use Add missing material. Both users and admins can do this.",False),
('Adding missing material while receiving','Create the missing material and receive its stock in the same popup.','mobile-missing.png','desktop-missing.png',[
 'In <b>Receive</b>, select <b>Add missing material</b>. It is available to users and admins, even with an empty catalog.',
 'Enter <b>Colour / finish</b>, <b>Material</b>, <b>Thickness</b>, <b>Width</b> and <b>Height</b>. Use positive dimensions in millimetres.',
 'Optionally enter a whole-number <b>Reorder point</b>. Blank uses zero for new materials.',
 'Enter the <b>Quantity received</b> and optional <b>Supplier / PO reference</b> in this popup.',
 'Select <b>Receive stock</b>. The catalog item, stock and receipt record are saved together.'
],'If a matching material already exists, its stock is increased without creating a duplicate. Existing reorder points are preserved.',False),
('5. Dispatching to a Job','Use this whenever material is pulled from stock and sent out to a job.','original-9-0.png','desktop-dispatch.png',[
 'Open <b>Dispatch</b>. Search and select the correct full panel or offcut.',
 'Enter the <b>Order number</b> and optional <b>Job reference</b>.',
 'Enter the <b>Quantity to dispatch</b>. Check available SOH and the physical item.',
 'Select <b>Confirm dispatch</b>, then verify the reduced SOH and sync status.'
],'If a usable piece remains, add it through the offcut form. Do not count the same material twice.',False),
('6. Writing Off Damaged Stock','Use this when damaged material must be removed from stock on hand.','original-10-0.png','desktop-damage.png',[
 'Open <b>Damage</b> and select the affected stock item.',
 'Choose the <b>Reason</b> and enter the <b>Quantity damaged</b>.',
 'Use <b>Add photo</b> to attach at least one clear photo of the damage. Evidence is required.',
 'Select <b>Write off stock</b>. Confirm the deduction from the correct item.'
],'Do not dispatch and write off the same quantity twice. Ask an admin to review incorrect movements.',False),
('7. Job History','Use this to review past dispatches, grouped by job.','original-11-0.png','desktop-jobs.png',[
 'Open <b>Jobs</b> to find dispatch history by job reference or order number.',
 'Review the relevant job and its material movements. Check quantities and timestamps.',
 'For receipts, damage and other actions, open <b>{activity}</b>. The recorded user helps identify who made the entry.'
],'Job history and activity are records of previous actions. Use current SOH to check what is available now.',False),
('8. Stocktaking Procedure','Plan the physical count before resetting quantities.','mobile-backup.png','desktop-backup.png',[
 'Pause normal stock movements. An <b>admin</b> takes a backup before starting the count.',
 'Use <b>Stocktake reset</b> in Settings and follow its confirmation. Full-panel quantities become zero and offcuts are cleared.',
 'Count the warehouse by material, colour, thickness and dimensions. Users and admins enter counted panels through <b>Receive</b>.',
 'Enter usable offcuts through the offcut form. Reconcile discrepancies and confirm all devices have synced before resuming work.'
],'Stocktake reset preserves the catalog, damage reasons and prior activity. The reset itself is logged.',True),
('9. Voiding a Mistaken Entry','Reverse an eligible stock movement without removing the audit history.','original-13-0.png','desktop-activity.png',[
 'Open <b>{activity}</b>. Find the exact receipt, dispatch or damage entry.',
 'Check the item, quantity, date and recorded user before using <b>Void</b>.',
 'Review and confirm the reversal. Check the resulting SOH.',
 'If blocked by stock or a conflict, investigate first. Do not force a duplicate correction.'
],'Voiding preserves the original entry and records its reversal. It does not silently delete history.',True),
('10. Settings: Materials Catalog','Manage the approved material, colour and size combinations.','mobile-settings.png','desktop-catalog.png',[
 'Open <b>Settings</b> and <b>{catalog}</b>.',
 'Use <b>Add material</b> for one new entry, or the edit control to correct an existing entry.',
 'Enter colour, material, thickness, width, height and optional reorder point. Check all dimensions in millimetres.',
 'Save the item. New catalog entries made here start with <b>zero stock</b>. Receive physical deliveries separately.'
],'Regular users can add missing material only with a matching receipt in Receive. Catalog editing and deletion remain admin-only.',True),
('Adding catalog materials in bulk','Enter multiple sizes in the app; no spreadsheet import is needed.','mobile-catalog-bulk.png','desktop-catalog-bulk.png',[
 'In the catalog, select <b>Bulk entry</b>. Enter the required <b>Material</b> and <b>Colour</b> once.',
 'Add rows for <b>Thickness</b>, <b>Width</b>, <b>Height</b> and optional <b>Reorder point</b>.',
 'Use <b>+ Add line</b> for another size and the <b>red trash icon</b> to remove a row. Blank reorder points use zero.',
 'Select <b>Add N catalog items</b>. Correct incomplete values and duplicates before saving the whole batch.'
],'Dimensions must be positive. Duplicate material/colour/size combinations are rejected. New items start with zero stock.',True),
('11. Settings: Damage Reason Codes','Maintain the reasons used when recording damaged stock.','original-16-0.png','desktop-reasons.png',[
 'Open <b>Settings</b> and the damage-reasons controls.',
 'To add a reason, enter its description and use the add control.',
 'To remove a reason, use its trash icon. Review the choice before confirming.'
],'Existing damage records retain the reason recorded at the time. Use the damage log to review past write-offs.',True),
('12. Settings: Users','Give every staff member their own account.','mobile-settings.png','desktop-users.png',[
 'Open <b>{users}</b>. Give new staff the current registration code so they can register their own account.',
 'Use the admin control to grant or revoke admin access only where required.',
 'Use <b>Reset PIN</b> for a forgotten PIN. It resets that user to the current registration code and revokes existing sessions.',
 'Have the user choose a new personal PIN. Use the remove-user control only when their access should end.'
],'Keep registration codes and PINs out of screenshots, job notes and shared messages. Never share an admin login.',True),
('13. Settings: Email Reports','Set the report recipients and delivery schedule.','mobile-settings.png','desktop-email.png',[
 'Open the <b>email-report settings</b> in Settings.',
 'Review recipient email addresses and choose the days reports should be sent.',
 'Set the time and check the displayed <b>timezone</b>.',
 'Enable the schedule and <b>save settings</b>.',
 'Use the <b>test-send</b> control to verify delivery to the intended recipients.'
],'Scheduled reports run on the server. Nobody needs to leave an app open for delivery.',True),
('14. Settings: Backup & Recovery','Back up before stocktakes, restores or major catalog changes.','mobile-backup.png','desktop-backup.png',[
 'Open the <b>backup controls</b> in Settings. Take a current backup before any high-impact action.',
 'Review the backup date before choosing <b>Restore</b>. Pause stock changes across devices.',
 'Follow the restore confirmation. If stock changes after your review, refresh and review again.',
 'Refresh other devices after the restore and reconcile any pending changes created against the old state.'
],'Daily snapshots are normally retained for 14 days. Server restores preserve current activity history and do not roll back user credentials.',True),
('Stocktake reset & Full reset','These controls have different effects. Read the warning before proceeding.','mobile-backup.png','desktop-backup.png',[
 '<b>Stocktake reset</b> sets full-panel SOH to zero and clears offcuts. Catalog entries, reasons and history remain.',
 '<b>Full reset</b> clears catalog and stock and restores default damage reasons. Prior activity is retained with a reset record.',
 'User accounts and PINs are not removed by these stock resets.',
 'Make a backup first and follow the displayed confirmation phrase. Do not use reset controls as routine housekeeping.'
],'A reset is not a way to erase audit history. Only admins should perform it after a deliberate review.',True),
('Pending changes & sync recovery','A local save is not confirmation that other devices have received the change.','mobile-settings.png','desktop-stock.png',[
 'Check the connection and sync indicator. Keep the device and the account that created pending changes available.',
 'If offered, use <b>Export pending changes</b> and save the export for reconciliation.',
 'Do not clear browser storage, reinstall or discard pending work before it has been reviewed.',
 'Only one tab may edit on a device at a time. Close another editing tab if instructed; sign back in as the owner of queued changes.'
],'Discarding pending changes does not apply them to shared stock. Contact an admin if the correct state is uncertain.',False),
('15. CNC Tracker','Find scheduled work by job reference, order, sheet or panel.','mobile-cnc.png','desktop-cnc.png',[
 'Open <b>CNC</b>. Expand the <b>job reference</b>, then its <b>order</b>. Orders appear highest number first within each job.',
 'Use search and the <b>Pending / Completed</b> filters to find the required work.',
 'Use <b>Complete panel</b> for one panel, or <b>Complete sheet</b> above it for the whole order/sheet.',
 'Check the completion confirmation before saving. Only mark work completed after it has actually been cut.'
],'Users and admins can complete CNC work. Completion records progress only; it does not deduct warehouse stock.',False),
('Scheduling CNC panels','Admins can schedule one panel or enter many panels together.','mobile-cnc-bulk.png','desktop-cnc-bulk.png',[
 'Use <b>{schedule}</b> for a single panel, or <b>{cncbulk}</b> for several.',
 'For bulk entry, enter the required <b>Order number</b> and <b>Job reference</b> once.',
 'Enter <b>Sheet number</b> and <b>Panel ID</b> on each row. Add lines as needed; use the red trash icon to remove a row.',
 'Select <b>Schedule N panels</b>. Blank rows are ignored; incomplete or repeated sheet/panel pairs must be corrected.'
],'Job references use title case. An order label such as Order #001234 becomes 001234. A leading panel-ID letter is capitalized.',True),
('Confirming a panel or sheet','The confirmation lists the panel IDs affected by your action.','mobile-sheet-confirm.png','desktop-confirm.png',[
 '<b>Complete panel</b> asks you to confirm the individual panel ID.',
 '<b>Complete sheet</b> lists every pending panel for that order and sheet. Scroll through the whole list if necessary.',
 'The sheet action also includes matching panels hidden by your search. Already completed panels and other sheets stay unchanged.',
 'Confirm only when all listed work is complete, or choose <b>Cancel</b> to leave it unchanged.'
],'The pictured example contains one pending panel. A sheet with several pending panels lists all of their IDs.',False),
('16. Shared CNC Tracker & Excel','Share a read-only view that stays up to date.','mobile-shared.png','desktop-shared.png',[
 'In CNC, select <b>Copy shareable link</b>. Send it only to intended viewers.',
 'Open the link on a phone or desktop. Expand job/order groups and use search or status filters.',
 'Select <b>Excel</b> to download the connected workbook. Open it in desktop Microsoft Excel.',
 'If you trust the source, allow editing and its data connection when prompted. Keep Excel open for the one-minute refresh.'
],'The shared page and workbook are read-only. Edits in Excel do not change PanelStock. Treat the link and workbook as access to CNC information.',False),
('Excel refresh & status colours','One connected workbook can refresh without repeated downloads.','mobile-shared.png','desktop-shared.png',[
 '<b>Completed</b> rows are green and <b>Pending</b> rows are yellow across all eleven exported columns.',
 'Colours update with refreshed statuses, including newly added rows. Headers and blank rows are not coloured.',
 'Download an older workbook once again to receive the new colour rules. Routine changes then refresh without another download.',
 'If refresh stops, check Excel connection messages. Do not lower global Trust Center security settings. The workbook contains no macros.'
],'Refresh runs on opening and every minute while desktop Excel is open. On mobile, use the shared browser tracker.',False)
]

CROPS={
 'desktop-shared.png':(0,0,1280,720),
 'desktop-register.png':(448,212,384,382),'desktop-login.png':(448,212,384,390),
 'desktop-users.png':(504,160,488,265),'desktop-email.png':(581,236,576,480),
 'desktop-reasons.png':(504,160,728,400),

 'desktop-missing.png':(304,128,672,464),'desktop-confirm.png':(416,162,448,395),
 'desktop-offcut.png':(304,54,672,612),'desktop-cnc-bulk.png':(272,56,420,474),
 'desktop-catalog-bulk.png':(504,96,420,480),'original-13-0.png':(36,770,936,780),
 'original-16-0.png':(36,780,936,1100)
}

def para(c,text,x,top,width,style=BODY):
 p=Paragraph(text,style);w,h=p.wrap(width,1000);p.drawOn(c,x,792-top-h);return h

def logo(c):
 c.drawImage(str(ASSETS/'lennox-logo.png'),492,720,width=80,height=40,preserveAspectRatio=True,mask='auto')

def screenshot(c,name,x,top,maxw,maxh,crop=None):
 path=ASSETS/name;iw,ih=Image.open(path).size
 sx,sy,sw,sh=crop or CROPS.get(name,(0,0,iw,ih));scale=min(maxw/sw,maxh/sh)
 w,h=sw*scale,sh*scale;y=792-top-h
 c.saveState();p=c.beginPath();p.roundRect(x,y,w,h,12);c.clipPath(p,stroke=0)
 c.drawImage(str(path),x-sx*scale,y+(sy+sh-ih)*scale,iw*scale,ih*scale,mask='auto');c.restoreState()
 return w,h

def note(c,text,color=None):
 style=ParagraphStyle('note',parent=SMALL,textColor=HexColor('#b91c1c') if color else GRAY)
 p=Paragraph(text,style);_,h=p.wrap(512,100)
 assert h<48,(text,h)
 y=792-754
 c.setFillColor(HexColor('#fff1f2') if color else HexColor('#f5f5f5'));c.roundRect(40,y,532,h+18,6,fill=1,stroke=0)
 p.drawOn(c,50,y+9)

CONTENTS=['Getting Started','Logging In & Registering','Viewing Stock & Exporting Reports','Receiving Stock','Dispatching to a Job','Writing Off Damaged Stock','Job History','Stocktaking Procedure (Admin-initiated)','Voiding a Mistaken Entry (Admin)','Settings: Materials Catalog','Settings: Damage Reason Codes','Settings: Users','Settings: Email Reports','Settings: Backup, Reset & Recovery','CNC Tracker','Shared CNC Tracker & Excel']

for repo,edition in [('panelstock','Mobile / tablet'),('panelstock-desktop','Desktop')]:
 if repo != REPO_ROOT.name:continue
 mobile=repo=='panelstock';root=BASE/repo;dest=root/'docs/sop';dest.mkdir(parents=True,exist_ok=True)
 values=dict(stock='SOH' if mobile else 'Stock',activity='Settings &gt; Recent activity' if mobile else 'Settings &gt; Activity Log',catalog='Materials catalog' if mobile else 'Materials Catalog',users='Settings &gt; Manage users &amp; admins' if mobile else 'Settings &gt; Users',schedule='Schedule' if mobile else 'Schedule panel',cncbulk='Schedule multiple panels' if mobile else 'Bulk entry')
 out=root/'PanelStock_SOP.pdf'
 c=Canvas(str(out),pagesize=(612,792));c.setTitle(f'PanelStock SOP - {edition}');c.setAuthor('Lennox Facades')
 logo(c);para(c,'PanelStock',40,192,532,ParagraphStyle('cover',fontName='Helvetica-Bold',fontSize=30,leading=36,textColor=NAVY));para(c,'Standard Operating Procedures',40,236,532,ParagraphStyle('subcover',fontName='Helvetica',fontSize=17,leading=21,textColor=TEAL))
 para(c,'Receiving  &middot;  Dispatching  &middot;  Damage  &middot;  Stocktaking  &middot;  Settings  &middot;  CNC',40,276,532,ParagraphStyle('tag',parent=SMALL,fontSize=11,leading=15))
 c.setStrokeColor(HexColor('#d4d4d4'));c.line(40,487,572,487)
 para(c,'Lennox Facades',40,320,532,ParagraphStyle('org',parent=SMALL,fontSize=11))
 para(c,f'For warehouse staff using PanelStock - {edition.lower()} edition.',40,340,532,SMALL)
 para(c,'Updated 31 August 2026 | Original SOP layout restored',40,364,532,SMALL);c.showPage()
 logo(c);para(c,'Contents',40,36,440,TITLE)
 for i,t in enumerate(CONTENTS,1):para(c,f'{i}. {t}',40,76+(i-1)*22,510,ParagraphStyle('toc',parent=BODY,fontSize=10.5,leading=15))
 c.showPage()
 logo(c);para(c,'1. Getting Started',40,36,440,TITLE)
 url='https://app.panelstockhq.com' if mobile else 'https://web.panelstockhq.com'
 para(c,'How to access PanelStock for the first time on your '+('phone or tablet.' if mobile else 'desktop.'),40,62,450,SMALL)
 para(c,'Open the app in your browser',40,91,430,ParagraphStyle('h',parent=BODY,fontSize=12.5,leading=16,textColor=TEAL,fontName='Helvetica-Bold'))
 para(c,'Open your browser and go to:<br/><br/><b>'+url.replace('https://','')+'</b><br/><br/>Or scan this code to open the link directly.',40,120,390)
 qr=QrCodeWidget(url);b=qr.getBounds();d=Drawing(76,76,transform=[76/(b[2]-b[0]),0,0,76/(b[3]-b[1]),0,0]);d.add(qr);renderPDF.draw(d,c,493,605)
 blocks=[('Using PanelStock','Use '+('the bottom navigation to open SOH, Receive, Dispatch, Damage, CNC, Jobs and Settings.' if mobile else 'the left sidebar to open Stock, Receive, Dispatch, Damage, CNC, Jobs and Settings.')),('Your account and permissions','Use your own account. Users and admins can receive stock, add a missing material with a receipt, dispatch, record damage, add offcuts and complete CNC work. Admins manage catalog settings, scheduling, user access and resets.'),('Before you leave the device','Check the sync indicator after recording work. Saved on this device does not mean other devices have received the update. Keep pending changes available for review.'),('Screenshots in this guide','The original numbered-step and screenshot layout is retained. Current screenshots use isolated example data; relevant original examples are preserved. Do not copy example quantities or job details into live work.')]
 y=235
 for title,text in blocks:
  para(c,title,40,y,532,ParagraphStyle('h2',parent=BODY,fontSize=12.5,leading=16,textColor=TEAL,fontName='Helvetica-Bold'));y+=27;y+=para(c,text,40,y,532)+24
 c.showPage()
 md=[f'# PanelStock SOP - {edition}','Original-style edition | Updated 31 August 2026','']
 for title,sub,mob,desk,steps,callout,admin in PAGES:
  logo(c);h=para(c,title,40,36,440,TITLE)
  top=36+h+10
  if admin:
   c.setFillColor(HexColor('#fff1f2'));c.roundRect(40,792-top-34,532,34,6,fill=1,stroke=0)
   para(c,'<b>ADMIN ONLY</b><br/>'+sub,50,top+5,510,ParagraphStyle('admin',parent=SMALL,textColor=HexColor('#b91c1c')));top+=48
  else:top+=para(c,sub,40,top,532,SMALL)+18
  image_name=mob if mobile else desk
  # The desktop guides use current screenshots; common sign-in fields are labelled clearly.
  shot_top=max(top,96);shot_h=570 if shot_top<110 else 540
  shot_h=min(shot_h,704-shot_top)
  if mobile:
   screenshot(c,image_name,342,shot_top,230,shot_h)
   start=shot_top+38;end=shot_top+shot_h-45;step_width=260
  else:
   iw,ih=Image.open(ASSETS/image_name).size
   crop=CROPS.get(image_name)
   if crop is None and iw>1000:crop=(260,64,1000,650)
   sw,sh=(crop[2],crop[3]) if crop else (iw,ih)
   scale=min(532/sw,330/sh);image_width=sw*scale
   _,actual_h=screenshot(c,image_name,40+(532-image_width)/2,shot_top,532,330,crop)
   start=shot_top+actual_h+25;end=698;step_width=510
  for n,text in enumerate(steps,1):
   cy=start+(n-1)*(end-start)/max(1,len(steps)-1)
   c.setFillColor(NAVY);c.circle(49,792-cy-7,9,fill=1,stroke=0);c.setFillColor(white);c.setFont('Helvetica-Bold',9);c.drawCentredString(49,792-cy-10,str(n))
   text=text.format(**values);hh=para(c,text,62,cy-1,step_width)
   assert hh<90,(title,n,hh)
  note(c,callout)
  if not mobile and image_name.startswith(('mobile-','original-')):
   para(c,'Common controls shown in the mobile example.',342,min(shot_top+shot_h+5,707),230,ParagraphStyle('caption',parent=SMALL,fontSize=7,leading=9))
  c.showPage();None
  md+=['## '+title,'',sub,'']+[f'{n}. '+s.format(**values) for n,s in enumerate(steps,1)]+['','> '+callout,'',f'![{title}](docs/sop/{image_name})','']
 c.save();(root/'SOP.md').write_text('\n'.join(md),encoding='utf8');print(out)
