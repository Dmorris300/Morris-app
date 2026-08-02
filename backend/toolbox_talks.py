"""Morris — Toolbox Talks V2.

Provides:
  • /api/toolbox-talks/topics       — built-in topic library (16 canonical UK talks)
  • /api/toolbox-talks/templates    — user-scoped saved custom talks (soft-delete)
  • /api/toolbox-talks/stats?projectId=…  — per-project counts (completed, last, next)

The finished talk is saved via /api/documents/save with toolId='toolbox-talk';
server.py's documents/save handler now emits a 'toolbox_talk_delivered' timeline
event when linked to a job.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


# ---------------- Built-in topic library ----------------
# Each topic is a fully-populated skeleton the user can edit in Step 3.

def _sec(intro, hazards, controls, best, emergency, key, questions):
    return {
        "introduction": intro,
        "hazards": hazards,
        "controlMeasures": controls,
        "bestPractice": best,
        "emergencyProcedures": emergency,
        "keyMessages": key,
        "questions": questions,
    }


TOPIC_LIBRARY = [
    {
        "id": "working-at-height",
        "title": "Working at Height",
        "category": "Safety",
        "duration": "10 min",
        "sections": _sec(
            "Falls from height remain the biggest single cause of construction fatalities in the UK. This talk covers the Work at Height Regulations and the practical steps required before anyone leaves the ground.",
            [
                "Fall from unprotected edges, openings or roofs.",
                "Falls from ladders and step-ups used incorrectly.",
                "Falling objects striking people below.",
                "Sudden weather changes — wind, rain, ice.",
            ],
            [
                "Never work at height where it can be reasonably avoided.",
                "Use scaffolding, MEWPs or podium towers before ladders.",
                "Every ladder inspected before use — feet, rungs, stiles.",
                "Fall arrest / restraint system for edges and skylights.",
                "Exclusion zones under overhead work; hard barriers if practical.",
            ],
            [
                "Three points of contact on ladders at all times.",
                "Do not overreach — move the platform.",
                "Tools tethered or in a tool belt, not carried in hands.",
                "Stop work if wind exceeds 17 mph on scaffolds, 12.5 mph on MEWPs.",
            ],
            [
                "First aider on site and rescue plan for any fall arrest system in use.",
                "Suspended casualty — cut down within 15 minutes to prevent suspension trauma.",
                "Nearest A&E route confirmed and shared before work starts.",
            ],
            [
                "Working at height is the biggest killer on our sites — treat every metre seriously.",
                "If you cannot do the job safely, stop and speak to the supervisor.",
            ],
            [
                "What is the rescue plan for the harness on this site?",
                "Where are your ladder-inspection tags?",
                "What wind speed stops work on the podium tower?",
            ],
        ),
    },
    {
        "id": "ladders",
        "title": "Ladder Safety",
        "category": "Safety",
        "duration": "5 min",
        "sections": _sec(
            "Ladders are the most common access equipment on site and also the most commonly misused. This talk covers safe selection, inspection and use.",
            [
                "Ladder slipping at the base or top.",
                "Overreaching and falling sideways.",
                "Damaged stiles or rungs collapsing.",
                "Contact with overhead power lines.",
            ],
            [
                "Choose the right ladder for the job — Class 1 or EN 131 only.",
                "Secure the ladder at the top or foot before climbing.",
                "Angle of 75° (1 in 4 rule).",
                "Extend at least 1 m above landing point.",
            ],
            [
                "Pre-use inspection recorded on ladder register.",
                "Face the ladder, both hands free while climbing.",
                "Move the ladder rather than lean sideways.",
            ],
            [
                "Casualty at height — do not move if spinal injury suspected.",
                "Site first aider and 999 for major fall.",
            ],
            [
                "A ladder is for short-duration access only — under 30 minutes.",
                "If in doubt, use a tower or MEWP instead.",
            ],
            [
                "Show me the correct set-up angle for a ladder.",
                "What are the signs a ladder should be quarantined?",
            ],
        ),
    },
    {
        "id": "scaffold-safety",
        "title": "Scaffold Safety",
        "category": "Safety",
        "duration": "10 min",
        "sections": _sec(
            "Scaffolding provides safer, faster access when correctly erected. This talk covers the daily user checks required by the Work at Height Regulations and TG20.",
            [
                "Unsafe access — missing handrails or toe boards.",
                "Overloading of platforms.",
                "Ties or braces removed by other trades.",
                "Slippery boards in wet weather.",
            ],
            [
                "Only work on scaffolds tagged green on the current Scafftag.",
                "No unauthorised modifications — call the scaffolder.",
                "Handrails at 950 mm plus intermediate rail; toe board 150 mm.",
                "Materials distributed evenly, never stacked above handrails.",
            ],
            [
                "Report any missing or damaged component immediately.",
                "Housekeeping cleared at the end of every shift.",
                "Never remove any part of a scaffold — even temporarily.",
            ],
            [
                "Person trapped or fallen — activate site emergency plan.",
                "Scaffold collapse — isolate area and call SFPD.",
            ],
            [
                "The Scafftag is the only proof a scaffold is safe today.",
                "If in doubt — stay off it and call the supervisor.",
            ],
            [
                "Where is the current Scafftag located?",
                "What is the maximum load per platform on this scaffold?",
            ],
        ),
    },
    {
        "id": "manual-handling",
        "title": "Manual Handling",
        "category": "Health",
        "duration": "5 min",
        "sections": _sec(
            "Manual handling injuries account for a third of all reported workplace injuries. This talk covers TILE (Task, Individual, Load, Environment) and safe lifting technique.",
            [
                "Musculoskeletal injury from lifting, carrying or twisting.",
                "Slips or trips while carrying.",
                "Crush injuries from dropped loads.",
            ],
            [
                "Avoid the lift where possible — use trolley, sack barrow, or extra hands.",
                "Assess the load: weight, size, sharp edges.",
                "Clear path from pickup to setdown before lifting.",
            ],
            [
                "Feet shoulder width apart, bend knees not back.",
                "Load close to body, chin up.",
                "Two-person lift for any load over 25 kg or awkward shape.",
            ],
            [
                "Any strain or sudden pain — stop, sit, call the first aider.",
                "Report all near-miss lifts on the site incident register.",
            ],
            [
                "Your back is the only one you have — protect it every day.",
                "It is never worth 'just having a go' with a heavy load.",
            ],
            [
                "What is the safe lifting limit for one person on this site?",
                "What is the TILE assessment used for?",
            ],
        ),
    },
    {
        "id": "coshh",
        "title": "COSHH Awareness",
        "category": "Health",
        "duration": "10 min",
        "sections": _sec(
            "The Control of Substances Hazardous to Health Regulations require every substance we use to be assessed. This talk covers safety data sheets and daily controls.",
            [
                "Inhalation of dust, fumes or vapours.",
                "Skin contact causing dermatitis or burns.",
                "Splashes into eyes.",
                "Ingestion from contaminated hands.",
            ],
            [
                "Read the COSHH assessment for the product before use.",
                "Use LEV, respiratory or eye protection as specified.",
                "Store substances in original labelled containers only.",
                "Wash before eating or drinking.",
            ],
            [
                "Know where the SDS folder is on this site.",
                "Never mix products.",
                "Report any splash or spill on the day it happens.",
            ],
            [
                "Skin contact — rinse thoroughly with water for 15 minutes.",
                "Splash to eye — use eye wash and attend A&E.",
                "Spill — contain, ventilate, refer to SDS spill section.",
            ],
            [
                "COSHH is our legal duty — the products are only safe if used as assessed.",
                "If in doubt, check the SDS — it takes 30 seconds.",
            ],
            [
                "Where is our COSHH register kept on site?",
                "Name three substances on your job today and their PPE.",
            ],
        ),
    },
    {
        "id": "ppe",
        "title": "Personal Protective Equipment (PPE)",
        "category": "Safety",
        "duration": "5 min",
        "sections": _sec(
            "PPE is the last line of defence — it does not remove hazards, only reduces the harm if all else fails. This talk covers the correct use and care of the site PPE minimum standard.",
            [
                "Head injury from falling objects.",
                "Foot injury from nails or dropped materials.",
                "Eye injury from grinding or drilling.",
                "Hearing damage from cumulative exposure.",
            ],
            [
                "Site minimum: hard hat, safety boots, hi-vis, gloves, eye protection when using power tools.",
                "Task-specific PPE per RAMS: harness, respiratory, hearing.",
                "PPE inspected before use, replaced when damaged.",
            ],
            [
                "PPE fits correctly — a loose hard hat is no hard hat.",
                "Store PPE clean and dry.",
                "Never share respiratory or hearing PPE.",
            ],
            [
                "Damaged PPE — quarantine and replace before continuing.",
                "Impact to hard hat — bin the hat, get a new one.",
            ],
            [
                "PPE is not optional — no PPE, no site.",
                "Report worn or damaged PPE the day you notice it.",
            ],
            [
                "What is the site PPE minimum standard?",
                "How do you check your hard hat is still serviceable?",
            ],
        ),
    },
    {
        "id": "fire-safety",
        "title": "Fire Safety",
        "category": "Safety",
        "duration": "10 min",
        "sections": _sec(
            "Fires on construction sites cost lives, jobs and reputations. This talk covers the fire risk assessment, hot works permits and the site evacuation plan.",
            [
                "Ignition from hot works — welding, grinding, cutting.",
                "Combustible material storage near ignition sources.",
                "Blocked escape routes.",
                "Faulty electrical leads or overloaded sockets.",
            ],
            [
                "Hot works permit signed by supervisor before any spark work.",
                "Fire extinguisher within 5 m of hot works.",
                "Fire watch for 60 minutes after completion.",
                "Combustibles removed or covered with fire blanket.",
            ],
            [
                "Know your two nearest escape routes.",
                "Do not prop fire doors open.",
                "Every 'unofficial' cable or extension is a risk — flag it.",
            ],
            [
                "On discovering a fire — raise the alarm, evacuate to assembly point, call 999.",
                "Only tackle a fire with the correct extinguisher and if trained.",
                "Never re-enter for personal belongings.",
            ],
            [
                "Prevention is 100% of the answer — every fire started somewhere.",
                "Hot works stops 60 minutes before end of shift.",
            ],
            [
                "Where is the site assembly point?",
                "What class of fire is caused by petrol or diesel?",
            ],
        ),
    },
    {
        "id": "slips-trips",
        "title": "Slips, Trips and Falls",
        "category": "Safety",
        "duration": "5 min",
        "sections": _sec(
            "Slips, trips and falls account for 30% of major site injuries. This is entirely preventable through housekeeping.",
            [
                "Wet or oily floors.",
                "Trailing cables, hoses or tools.",
                "Uneven surfaces or steps.",
                "Poorly lit stairways.",
            ],
            [
                "Housekeeping is everyone's job — clear as you go.",
                "Cables run at high level or under matting.",
                "Non-slip footwear compulsory.",
                "Immediately mark and clean any spill.",
            ],
            [
                "Never step over cables — coil them.",
                "Report faulty lighting before you leave that area.",
                "Site walkways clear and no material stored on them.",
            ],
            [
                "Fall on same level — assess for hidden injury before moving.",
                "Fall down stairs — do not move casualty, call 999 for major injury.",
            ],
            [
                "The tidy site is the safe site.",
                "Ten seconds to clear a hazard now saves someone getting hurt later.",
            ],
            [
                "What are the three biggest slip hazards on this site today?",
                "Who is responsible for daily housekeeping in your area?",
            ],
        ),
    },
    {
        "id": "abrasive-wheels",
        "title": "Abrasive Wheels",
        "category": "Safety",
        "duration": "10 min",
        "sections": _sec(
            "Angle grinders and cut-off saws are the most dangerous portable tools on site. Only trained operators may use them.",
            [
                "Disc shatter causing high-speed fragment injury.",
                "Kickback throwing the tool towards the operator.",
                "Sparks igniting combustibles.",
                "Hand-arm vibration and noise exposure.",
            ],
            [
                "Only trained and authorised operators — proof of training on record.",
                "Correct disc for the material; match RPM.",
                "Guards fitted at all times.",
                "Full-face visor, gloves, hearing PPE, apron.",
            ],
            [
                "Inspect disc before each use — chips, cracks, storage.",
                "Two-handed grip, feet braced.",
                "Never remove the guard.",
            ],
            [
                "Cut injury — apply direct pressure, elevate, call 999 for severe bleeding.",
                "Eye injury — do not rub, cover, attend A&E.",
            ],
            [
                "Abrasive wheels do not forgive mistakes.",
                "If you have not been trained on this tool — do not touch it.",
            ],
            [
                "What is the maximum operating RPM of this disc?",
                "Show me the correct stance for cutting.",
            ],
        ),
    },
    {
        "id": "electrical",
        "title": "Electrical Safety",
        "category": "Safety",
        "duration": "10 min",
        "sections": _sec(
            "Electricity is invisible until it kills. This talk covers 110V site tools, cable management and the permit-to-work system for live work.",
            [
                "Electric shock or electrocution from damaged leads.",
                "Fire from overloaded circuits.",
                "Contact with overhead or buried cables.",
                "Water and electricity — trailing leads in puddles.",
            ],
            [
                "Site tools must be 110V or battery — no 240V above ground floor.",
                "PAT tested and in date; visible label.",
                "RCD protection on any 240V feed.",
                "Cables raised or protected, never crushed by wheels.",
            ],
            [
                "Damaged leads — quarantine and label immediately.",
                "Buried services located and marked before any digging.",
                "Live work only under a permit issued by a competent person.",
            ],
            [
                "Shock casualty — isolate the supply before touching them.",
                "If in doubt — pull the isolator, call 999.",
            ],
            [
                "You cannot see electricity, but the effect is instant.",
                "If it is not 110V or battery, it does not belong on this site.",
            ],
            [
                "What is the correct action for a damaged cable?",
                "Where is the main isolator for this floor?",
            ],
        ),
    },
    {
        "id": "dust-control",
        "title": "Dust Control",
        "category": "Health",
        "duration": "10 min",
        "sections": _sec(
            "Silica, wood and MDF dusts cause long-term lung disease. This talk covers on-tool extraction, water suppression and RPE.",
            [
                "Respirable crystalline silica from cutting brick, concrete or stone.",
                "Wood dust — hard and soft, carcinogenic.",
                "Cement dust irritating skin and eyes.",
            ],
            [
                "On-tool LEV M-class extraction on every dusty tool.",
                "Water suppression as first choice on masonry cutting.",
                "Face-fit tested FFP3 as minimum RPE — no beards.",
                "Wet sweep or vacuum, never dry brush.",
            ],
            [
                "Change filters at the intervals stated by the manufacturer.",
                "Fit-check mask each time before entering dusty area.",
                "Contain the source — extract at the tool, not the room.",
            ],
            [
                "Respiratory distress — remove from area, seek medical advice.",
                "Silicosis is a long-latency disease — record every exposure.",
            ],
            [
                "You cannot see silica dust — the finest particles cause the damage.",
                "Water and vac, every time.",
            ],
            [
                "What class of vacuum do we use on this site?",
                "When was your face-fit test last completed?",
            ],
        ),
    },
    {
        "id": "asbestos",
        "title": "Asbestos Awareness",
        "category": "Health",
        "duration": "10 min",
        "sections": _sec(
            "Asbestos still kills more UK tradespeople than any other work-related cause. This talk covers where it is found, how to recognise it and what to do if you suspect it.",
            [
                "Inhalation of asbestos fibres from damaged materials.",
                "Disturbing hidden asbestos-containing materials (ACMs).",
                "Cross-contamination on clothing, tools, hair.",
            ],
            [
                "Read the asbestos register before starting any refurb or demo work.",
                "Assume suspect materials contain asbestos until sampled.",
                "Any suspect ACM — stop work, isolate area, notify PC.",
                "Only trained and licensed operatives may remove or disturb ACMs.",
            ],
            [
                "Photograph but do not disturb suspect materials.",
                "Report every ACM find on the day.",
                "Decontaminate before leaving site if suspected exposure.",
            ],
            [
                "Suspected exposure — do not go home in the same clothes. Report to PC.",
                "Bag contaminated PPE, tools and clothing on-site.",
            ],
            [
                "There is no safe level of asbestos exposure.",
                "If you are not sure — stop and ask.",
            ],
            [
                "Where is the asbestos register held on this site?",
                "What action do you take if you see suspect material?",
            ],
        ),
    },
    {
        "id": "excavations",
        "title": "Excavations",
        "category": "Safety",
        "duration": "10 min",
        "sections": _sec(
            "Excavation collapse is fast, silent and often fatal. This talk covers safe support, buried services and access.",
            [
                "Collapse of unsupported sides.",
                "Contact with buried gas, water or electricity.",
                "People or plant falling into the excavation.",
                "Water accumulation.",
            ],
            [
                "CAT and Genny survey plus service drawings before ANY dig.",
                "Battering or shoring above 1.2 m depth.",
                "Barriers and toe boards at edges.",
                "Safe access — ladder or ramp at least every 15 m.",
            ],
            [
                "Daily inspection before shift, after weather event, after impact.",
                "Spoil kept at least 1 m from edge.",
                "Do not enter unshored trench for any reason.",
            ],
            [
                "Buried service strike — evacuate 25 m, call utility emergency line.",
                "Casualty in collapsed trench — do not enter, call SFPD immediately.",
            ],
            [
                "Trenches collapse in seconds — support them from the start.",
                "The register at the box shows today's inspection status.",
            ],
            [
                "Where is today's excavation inspection record?",
                "What is the shoring specification for this trench?",
            ],
        ),
    },
    {
        "id": "traffic",
        "title": "Traffic Management",
        "category": "Safety",
        "duration": "10 min",
        "sections": _sec(
            "Vehicle-pedestrian interfaces kill more people on construction sites than falls from height. Segregation is the answer.",
            [
                "Reversing plant striking pedestrians.",
                "Overturn on slopes.",
                "Load falling from vehicles.",
                "Congestion on site roads.",
            ],
            [
                "Segregated pedestrian and vehicle routes wherever possible.",
                "Banksman for every reverse over 5 m or in a blind spot.",
                "One-way traffic on tight sites.",
                "Speed limit on site not exceeding 5 mph.",
            ],
            [
                "Hi-vis at all times when on the road network of the site.",
                "Make eye contact with the driver before crossing.",
                "Never walk behind a reversing vehicle.",
            ],
            [
                "Person struck by vehicle — do not move casualty, call 999.",
                "Vehicle overturn — cordon area, notify PC.",
            ],
            [
                "Every vehicle-pedestrian incident could have been prevented by segregation.",
                "Banksmen exist for a reason — use them.",
            ],
            [
                "Where is the delivery lay-by on this site?",
                "What is the site speed limit?",
            ],
        ),
    },
    {
        "id": "hot-works",
        "title": "Hot Works",
        "category": "Safety",
        "duration": "10 min",
        "sections": _sec(
            "Welding, cutting, grinding and brazing all count as hot works. Every one requires a permit and a fire watch.",
            [
                "Sparks igniting combustible materials.",
                "Concealed ignition — sparks entering cavities or ducts.",
                "Burns from direct heat, spatter or hot metal.",
                "UV exposure from welding arc.",
            ],
            [
                "Signed Hot Works Permit before any spark work.",
                "Combustibles removed to 10 m or covered with fire blanket.",
                "Fire extinguisher within 5 m; suitable for A + B + electrical.",
                "Fire watch for 60 minutes after works finish.",
            ],
            [
                "Screens around welding to protect adjacent workers.",
                "Never carry out hot works within 60 minutes of end of shift.",
                "Report all sparks that landed anywhere unexpected.",
            ],
            [
                "Fire discovered — raise alarm, evacuate, call 999.",
                "Burn to person — 20 minutes of cool running water.",
            ],
            [
                "Every fire on a construction site started with something 'small'.",
                "Permit + extinguisher + fire watch — every time.",
            ],
            [
                "How long is the fire watch after hot works?",
                "Show me your extinguisher position for today's cut.",
            ],
        ),
    },
    {
        "id": "confined-spaces",
        "title": "Confined Spaces",
        "category": "Safety",
        "duration": "15 min",
        "sections": _sec(
            "Confined spaces kill an average of 15 workers per year in the UK — most attempting to rescue others. Entry is only allowed under a permit with a rescue plan.",
            [
                "Oxygen depletion from displacement or consumption.",
                "Toxic atmosphere from stored substances or biological breakdown.",
                "Flammable atmosphere.",
                "Physical entrapment or engulfment.",
            ],
            [
                "Confined space permit signed by competent supervisor.",
                "Pre-entry gas test — O2, LEL, CO, H2S — record on permit.",
                "Continuous ventilation and gas monitoring.",
                "Tripod, harness and rescue team in position before entry.",
            ],
            [
                "Never enter to rescue without full BA and back-up.",
                "Communication maintained with entrant at all times.",
                "Permit closes formally at end of works.",
            ],
            [
                "Collapse inside — do not enter. Call 999. Emergency services with BA only.",
                "Gas alarm — evacuate immediately, ventilate, re-test.",
            ],
            [
                "The instinct to run in to help costs lives every year.",
                "No permit, no entry — no exceptions.",
            ],
            [
                "What gases are we monitoring for on this permit?",
                "Where is the rescue tripod positioned?",
            ],
        ),
    },
]


TEMPLATE_TOPIC_KEY = "custom"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class TalkSections(BaseModel):
    introduction: Optional[str] = ""
    hazards: Optional[List[str]] = []
    controlMeasures: Optional[List[str]] = []
    bestPractice: Optional[List[str]] = []
    emergencyProcedures: Optional[List[str]] = []
    keyMessages: Optional[List[str]] = []
    questions: Optional[List[str]] = []


class TemplateIn(BaseModel):
    name: str
    topicTitle: str
    sections: TalkSections


def build_router(db, get_user):
    router = APIRouter(prefix="/api/toolbox-talks", tags=["toolbox-talks"])

    def _shape(doc: dict) -> dict:
        d = dict(doc)
        d.pop("_id", None)
        return d

    @router.get("/topics")
    async def get_topics():
        return TOPIC_LIBRARY

    @router.get("/templates")
    async def list_templates(authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        rows = await db.toolbox_talk_templates.find(
            {"userId": user["id"], "isDeleted": {"$ne": True}}
        ).sort("updatedAt", -1).to_list(500)
        return [_shape(r) for r in rows]

    @router.post("/templates")
    async def create_template(body: TemplateIn, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Name is required")
        if not body.topicTitle.strip():
            raise HTTPException(status_code=400, detail="Topic is required")
        doc = {
            "id": str(uuid.uuid4()),
            "userId": user["id"],
            "name": body.name.strip(),
            "topicTitle": body.topicTitle.strip(),
            "sections": body.sections.model_dump(),
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "isDeleted": False,
        }
        await db.toolbox_talk_templates.insert_one(doc)
        return _shape(doc)

    @router.delete("/templates/{template_id}")
    async def delete_template(template_id: str, authorization: Optional[str] = Header(None)):
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        row = await db.toolbox_talk_templates.find_one({
            "id": template_id, "userId": user["id"], "isDeleted": {"$ne": True},
        })
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        await db.toolbox_talk_templates.update_one(
            {"id": template_id}, {"$set": {"isDeleted": True, "updatedAt": _now_iso()}}
        )
        return {"ok": True}

    @router.get("/stats")
    async def stats(
        projectId: Optional[str] = None,
        authorization: Optional[str] = Header(None),
    ):
        """Per-project (or global) counts: completed / due / last talk / next review.

        Best-practice cadence: one talk per project per week. Overdue = >7 days
        since last talk on a project. Next review = 7 days after last talk.
        """
        token = authorization.replace("Bearer ", "") if authorization else None
        user = await get_user(token)
        q = {"userId": user["id"], "toolId": "toolbox-talk"}
        if projectId:
            q["jobId"] = projectId
        docs = await db.documents.find(q).sort("createdAt", -1).to_list(500)
        now = datetime.now(timezone.utc)
        completed = len(docs)
        last_iso = docs[0].get("createdAt") if docs else None
        overdue_days = None
        next_review_iso = None
        due = False
        if last_iso:
            try:
                last_dt = datetime.fromisoformat(last_iso.replace("Z", "+00:00")) if isinstance(last_iso, str) else last_iso
                overdue_days = (now - last_dt).days
                due = overdue_days > 7
                next_review_iso = (last_dt + timedelta(days=7)).isoformat()
            except Exception:
                pass
        else:
            due = True
        return {
            "completed": completed,
            "due": bool(due),
            "lastTalkAt": last_iso,
            "nextReviewAt": next_review_iso,
            "overdueDays": overdue_days,
        }

    return router
