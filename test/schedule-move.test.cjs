const test=require('node:test'),assert=require('node:assert/strict'),{movedTimes}=require('../schedule-move.js');
const bounds={startHour:6,endHour:18};
test('moving snaps to half hours while preserving duration including quarter-hour tasks',()=>{
 assert.deepEqual(movedTimes({startTime:'07:00',endTime:'09:00'},7*60+20,bounds),{startTime:'07:30',endTime:'09:30'});
 assert.deepEqual(movedTimes({startTime:'07:15',endTime:'08:00'},8*60+20,bounds),{startTime:'08:30',endTime:'09:15'});
});
test('moving clamps the entire task inside working hours',()=>{
 assert.deepEqual(movedTimes({startTime:'07:00',endTime:'09:00'},23*60,bounds),{startTime:'16:00',endTime:'18:00'});
 assert.deepEqual(movedTimes({startTime:'07:00',endTime:'09:00'},0,bounds),{startTime:'06:00',endTime:'08:00'});
 assert.equal(movedTimes({startTime:'00:00',endTime:'23:00'},10*60,bounds),null);
});
