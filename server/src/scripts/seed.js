// Fills the database with demo users, tasks and two weeks of activity.
// Usage: npm run seed --workspace @tracker/server   (wipes existing data first)
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Activity } from '../models/Activity.js';
import { ApplicationUsage } from '../models/ApplicationUsage.js';
import { Employee } from '../models/Employee.js';
import { Performance } from '../models/Performance.js';
import { CameraObservation } from '../models/CameraObservation.js';
import { DailyAnalysis } from '../models/DailyAnalysis.js';
import { Report } from '../models/Report.js';
import { Screenshot } from '../models/Screenshot.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { recalculateDay } from '../services/performanceService.js';
import { categorizeApplication } from '../services/productivityService.js';
import { summarizeCameraDay } from '../utils/cameraSummary.js';
import { addDays, startOfDay } from '../utils/dateUtils.js';

const DEMO_PASSWORD = 'Password@123';
const DAYS = 14;
const WORK_HOURS = [9, 10, 11, 12, 14, 15, 16, 17];

const people = [
  { name: 'Akash Yadav', email: 'akash@workplus.dev', code: 'EMP-001', designation: 'Frontend engineer', focus: 0.92, sampleAnalysis: true },
  { name: 'Shashank Pandey', email: 'shashank@workplus.dev', code: 'EMP-002', designation: 'Product engineer', focus: 0.86, sampleAnalysis: true },
  { name: 'Riya Kapoor', email: 'riya@workplus.dev', code: 'EMP-003', designation: 'UX researcher', focus: 0.7 },
  { name: 'Mohit Singh', email: 'mohit@workplus.dev', code: 'EMP-004', designation: 'Backend engineer', focus: 0.78 }
];

const taskTitles = ['API integration', 'Dashboard polish', 'Usability interviews', 'Database indexing', 'Login flow', 'Report export', 'Agent idle detection', 'Design review'];
const apps = { productive: ['Code', 'Figma', 'Terminal', 'Postman'], other: ['Slack', 'Google Chrome', 'Zoom'] };

// Deterministic pseudo-random numbers so every seed produces the same demo data.
let state = 42;
function random() {
  state = (state * 1664525 + 1013904223) % 2 ** 32;
  return state / 2 ** 32;
}
const pick = (list) => list[Math.floor(random() * list.length)];

// Sample screenshot labels for the demo's Daily analysis pages (no images are created).
const SAMPLE_ACTIVITIES = {
  coding: ['editing code in an IDE', 'reviewing a pull request', 'running tests in a terminal'],
  documents: ['writing a document', 'editing a spreadsheet'],
  meeting: ['in a video meeting'],
  communication: ['reading team chat', 'writing an email'],
  research: ['reading technical documentation'],
  design: ['editing a design file'],
  social_media: ['browsing social media'],
  idle_or_locked: ['screen locked']
};
const PRODUCTIVE = new Set(['coding', 'documents', 'meeting', 'communication', 'research', 'design']);

function sampleCategory(focus) {
  const roll = random();
  if (roll < focus * 0.55) return 'coding';
  if (roll < focus * 0.7) return pick(['documents', 'research', 'design']);
  if (roll < focus * 0.85) return 'meeting';
  if (roll < focus) return 'communication';
  return pick(['social_media', 'idle_or_locked', 'communication']);
}

// Sample camera labels that roughly match the screen category at the same time.
const CAMERA_SAMPLES = {
  coding: [['working_at_computer', 'typing at the computer']],
  documents: [['working_at_computer', 'typing at the computer'], ['reading_or_writing', 'writing notes on paper']],
  design: [['working_at_computer', 'working at the computer']],
  research: [['working_at_computer', 'reading at the computer']],
  meeting: [['on_a_call', 'on a video call with headset']],
  communication: [['working_at_computer', 'typing at the computer'], ['talking_with_someone', 'talking with a colleague']],
  social_media: [['using_phone', 'looking at a phone'], ['taking_a_break', 'leaning back, taking a break']],
  idle_or_locked: [['away_from_desk', 'desk is empty'], ['eating_or_drinking', 'having a drink']]
};

/** Five recent working days of sample analyses, labelled as sample data. */
async function seedSampleAnalyses(employee, person, today) {
  let created = 0;
  for (let back = 0; created < 5 && back < 10; back += 1) {
    const date = addDays(today, -back);
    if ([0, 6].includes(date.getUTCDay())) continue;
    const timeline = [];
    for (const hour of WORK_HOURS) {
      for (let minute = 0; minute < 60; minute += 5) {
        const category = sampleCategory(person.focus);
        const capturedAt = new Date(date);
        capturedAt.setUTCHours(hour, minute);
        timeline.push({ capturedAt, category, activity: pick(SAMPLE_ACTIVITIES[category]) });
      }
    }
    const categoryMinutes = {};
    for (const entry of timeline) categoryMinutes[entry.category] = (categoryMinutes[entry.category] ?? 0) + 5;
    const productiveMinutes = timeline.filter((entry) => PRODUCTIVE.has(entry.category)).length * 5;
    const observations = timeline.map(({ capturedAt, category }) => {
      const [state, activity] = pick(CAMERA_SAMPLES[category]);
      return { employee: employee._id, observedAt: capturedAt, state, activity, confidence: 0.8, source: 'vision' };
    });
    await CameraObservation.insertMany(observations);
    const { stateMinutes, ...cameraTotals } = summarizeCameraDay(observations, 5);
    const codingHours = ((categoryMinutes.coding ?? 0) / 60).toFixed(1);
    const meetingMinutes = categoryMinutes.meeting ?? 0;
    await DailyAnalysis.create({
      employee: employee._id,
      date,
      screenshotCount: timeline.length,
      analyzedCount: timeline.length,
      categoryMinutes,
      productiveMinutes,
      timeline,
      camera: { stateMinutes, ...cameraTotals },
      summary: `Sample analysis for the demo: ${person.name.split(' ')[0]} spent about ${codingHours} hours coding and ${meetingMinutes} minutes in meetings, with ${Math.round((productiveMinutes / (timeline.length * 5)) * 100)}% of observed time on work-related screens.`,
      highlights: ['Long focused coding blocks in the morning', 'Steady activity through the afternoon'],
      suggestions: ['Group chat and email into a few set times', 'Keep the late-morning focus window free of meetings'],
      model: 'demo-sample',
      generatedAt: new Date()
    });
    created += 1;
  }
}

async function seed() {
  await connectDatabase();
  await Promise.all([User, Employee, Task, Activity, ApplicationUsage, Performance, Report, Screenshot, DailyAnalysis, CameraObservation].map((model) => model.deleteMany({})));

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const [admin, manager] = await User.create([
    { name: 'Sachin Chauhan', email: 'admin@workplus.dev', passwordHash, role: 'admin' },
    { name: 'Neha Verma', email: 'manager@workplus.dev', passwordHash, role: 'manager' }
  ]);

  const today = startOfDay();
  const firstDay = addDays(today, -(DAYS - 1));

  for (const person of people) {
    const user = await User.create({ name: person.name, email: person.email, passwordHash, role: 'employee' });
    const employee = await Employee.create({
      user: user._id,
      employeeCode: person.code,
      designation: person.designation,
      department: 'Engineering',
      manager: manager._id,
      trackingConsent: true,
      consent: {
        version: 2,
        activity: true,
        keyboard: true,
        apps: true,
        // The two people with sample daily analyses agreed to screenshots in the demo story.
        screenshots: Boolean(person.sampleAnalysis),
        managerViewScreenshots: Boolean(person.sampleAnalysis),
        acceptedAt: new Date()
      },
      // The same two people also turned on camera checks in camera-agent.
      cameraConsent: person.sampleAnalysis ? { given: true, mode: 'vision', acceptedAt: addDays(today, -14) } : { given: false }
    });

    const activity = [];
    const usage = [];
    for (let day = 0; day < DAYS; day += 1) {
      const date = addDays(firstDay, day);
      if ([0, 6].includes(date.getUTCDay())) continue;
      // A gentle upward trend over the fortnight.
      const focus = Math.min(person.focus + day * 0.006, 0.98);

      for (const hour of WORK_HOURS) {
        const capturedAt = new Date(date);
        capturedAt.setUTCHours(hour);
        const peakBoost = hour === 10 || hour === 11 ? 0.06 : 0;
        const activeSeconds = Math.round(3600 * Math.min(focus * (0.88 + random() * 0.12) + peakBoost, 1));
        activity.push({
          employee: employee._id,
          capturedAt,
          intervalSeconds: 3600,
          activeSeconds,
          idleSeconds: 3600 - activeSeconds,
          mouseEvents: Math.round(activeSeconds * (0.5 + random())),
          keyboardEvents: Math.round(activeSeconds * (0.8 + random()))
        });
        const productiveSeconds = Math.round(activeSeconds * focus);
        for (const [application, durationSeconds] of [[pick(apps.productive), productiveSeconds], [pick(apps.other), activeSeconds - productiveSeconds]]) {
          usage.push({ employee: employee._id, application, category: categorizeApplication(application), durationSeconds, capturedAt });
        }
      }
    }
    await Activity.insertMany(activity);
    await ApplicationUsage.insertMany(usage);

    const tasks = [];
    for (let index = 0; index < 8; index += 1) {
      const dueDate = addDays(firstDay, 1 + Math.floor(random() * (DAYS + 3)));
      dueDate.setUTCHours(18);
      const done = dueDate < today && random() < person.focus + 0.1;
      const completedAt = done ? new Date(dueDate.getTime() - (random() < person.focus ? 3 : -20) * 3600 * 1000) : undefined;
      const expectedMinutes = 120 + Math.floor(random() * 360);
      tasks.push({
        title: `${pick(taskTitles)} #${index + 1}`,
        assignedTo: employee._id,
        createdBy: manager._id,
        status: done ? 'done' : pick(['todo', 'in-progress', 'review']),
        priority: pick(['low', 'medium', 'high']),
        expectedMinutes,
        actualMinutes: done ? Math.round(expectedMinutes * (0.8 + random() * 0.5)) : Math.round(expectedMinutes * random() * 0.6),
        dueDate,
        completedAt
      });
    }
    // insertMany skips the save hook, so completedAt above is kept as generated.
    await Task.insertMany(tasks);

    for (let day = 0; day < DAYS; day += 1) await recalculateDay(employee._id, addDays(firstDay, day));
    if (person.sampleAnalysis) await seedSampleAnalyses(employee, person, today);
    console.log(`Seeded ${person.name}`);
  }

  console.log('\nDemo accounts (password for all: %s)', DEMO_PASSWORD);
  console.log(`  admin    ${admin.email}`);
  console.log(`  manager  ${manager.email}`);
  for (const person of people) console.log(`  employee ${person.email}`);
}

try {
  await seed();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (mongoose.connection.readyState) await disconnectDatabase();
}
