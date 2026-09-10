export function currentUserId(user) {
    return user?.profile?.sub || "";
}

export function canApproveMinutes(minutes, user) {
    if (typeof minutes?.permissions?.can_approve === "boolean") return minutes.permissions.can_approve;
    const userId = currentUserId(user);
    return Boolean(userId && minutes?.approver_id && userId === minutes.approver_id);
}

export function canEditMinutes(minutes, user) {
    if (typeof minutes?.permissions?.can_edit === "boolean") return minutes.permissions.can_edit;
    const userId = currentUserId(user);
    return Boolean(userId && [minutes?.registered_by_id, minutes?.owner_id,
        minutes?.demo_owner_id].includes(userId));
}
