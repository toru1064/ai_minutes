import test from "node:test";
import assert from "node:assert/strict";
import {cognitoGroups,isDemoUser} from "./auth.js";

test("DemoUser判定は配列とJSON文字列に対応する",()=>{
  assert.equal(isDemoUser({profile:{"cognito:groups":["DemoUser"]}}),true);
  assert.equal(isDemoUser({profile:{"cognito:groups":"[\"Users\",\"DemoUser\"]"}}),true);
  assert.deepEqual(cognitoGroups({profile:{"cognito:groups":"[Users, DemoUser]"}}),["Users","DemoUser"]);
  assert.equal(isDemoUser({profile:{"cognito:groups":["Users"]}}),false);
});
