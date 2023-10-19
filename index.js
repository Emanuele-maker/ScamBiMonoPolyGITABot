const TelegramBot = require("node-telegram-bot-api")
const User = require("./user")
const { getFullUser } = require("./getUserInfo")
const conn = require("./db")
require("dotenv").config()

const TOKEN = process.env.BOT_TOKEN
const CHATID = process.env.CHAT_ID
const ADMINCHATID = process.env.ADMIN_CHAT_ID
const api = new TelegramBot(TOKEN, { polling: true })
const feedbackRequests = []
const currentUsersMessages = {}

const registerUser = (id, username) => {
    conn.query(`INSERT INTO users(id, username, feedbacks, sus, verified) VALUES("${id}", "${username}", 0, 0, false)`, (err, rows) => {
        if (err) return console.error(err)
    })
}

const requestFeedback = msg => {
    let firstTaggedUser = msg.text.trim().replace("@feedback", "").split(" ").find(word => word.startsWith("@"))
    if (!firstTaggedUser || !firstTaggedUser.startsWith("@") || firstTaggedUser.length < 1) return api.sendMessage(CHATID, "Per favore, utilizza la sintassi corretta: @feedback @username.\nEsempio: @feedback <code>@Giuggetto</code>", {
        parse_mode: "HTML"
    })
    firstTaggedUser = firstTaggedUser.replace("@", "")
    if (firstTaggedUser.toLowerCase() === msg.from.username.toLowerCase()) api.sendMessage(CHATID, "Non puoi richiedere di aggiungere un feedback a te stesso!")
    else {
        conn.query("SELECT * FROM users", (err, dbUsers) => {
            if (err) return console.error(err)
            const usersId = dbUsers.map(dbUser => {
                return dbUser.id
            })
            if (err) return console.error(err)
            const user = new User(msg.from.id, msg.from.username, msg.from.first_name, firstTaggedUser)
            if (!usersId.includes(user.id.toString())) {
                registerUser(user.id, user.username)
                currentUsersMessages[msg.message_id] = user
            } else {
                currentUsersMessages[msg.message_id] = dbUsers.find(u => u.id === msg.from.id.toString())
            }
            getFullUser(firstTaggedUser.replace("@", ""))
            .then(fullTaggedUser => {
                if (!fullTaggedUser) return api.sendMessage(CHATID, "<b>Questo utente non esiste!</b> ✖", {
                    parse_mode: "HTML"
                })
                if (!usersId.includes(fullTaggedUser.id.toString())) {
                    registerUser(fullTaggedUser.id, fullTaggedUser.username)
                }
            })
        })
        feedbackRequests.push(msg)
        api.sendMessage(CHATID, `<b>Ciao!</b> Vuoi inviare il feedback agli admin? Segui gentilmente queste regole:\n\nInvia le prove del tuo scambio (screenshot della chat) Assicurati di aver correttamente inserito lo @username dell'utente.`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "✅",
                            callback_data: `btn_yes_${msg.from.id}`
                        },
                        {
                            text: "✖️",
                            callback_data: `btn_no_${msg.from.id}`
                        },
                    ]
                ]
            },
            parse_mode: "HTML"
        })
    }
}

// puts a user verified by the community
const verifica = msg => {
    api.getChatAdministrators(CHATID)
    .then(admins => {
        const adminsId = admins.map(admin => {
            return admin.user.id
        })
        api.getChatMember(CHATID, msg.from.id)
        .then(member => {
            if (!adminsId.includes(member.user.id)) return api.sendMessage(CHATID, "Solo gli admin possono eseguire questo comando!")
            let firstTaggedUser = msg.text.trim().replace(".verifica", "").split(" ").find(word => word.startsWith("@"))?.replace("undefined", "")
            if (!firstTaggedUser || firstTaggedUser.length < 1 || !firstTaggedUser.startsWith("@")) {
                if (msg.reply_to_message?.from?.username !== undefined) firstTaggedUser = msg.reply_to_message.from.username
                else return api.sendMessage(CHATID, "Per favore, utilizza la sintassi corretta: .verifica @username.\nEsempio: .verifica <code>@Giuggetto</code>", {
                    parse_mode: "HTML"
                })
            }
            firstTaggedUser = firstTaggedUser.replace("@", "")
            getFullUser(firstTaggedUser)
            .then(fullUser => {
                if (!fullUser) return api.sendMessage(CHATID, `<b>Questo utente non esiste!</b> ✖`, {
                    parse_mode: "HTML"
                })
                conn.query("SELECT * FROM users", (err, dbUsers) => {
                    if (err) return console.error(err)
                    const usersId = dbUsers.map(dbUser => {
                        return dbUser.id
                    })
                    const dbUser = dbUsers.find(u => u.id === fullUser.id.toString())
                    if (dbUser.verified) return api.sendMessage(CHATID, `<b>@${dbUser.username}</b> è già verificato! ✔️`, {
                        parse_mode: "HTML"
                    })
                    if (dbUser.sus) return api.sendMessage(CHATID, "Questo utente non può essere verificato perchè fa parte della lista dei <b>sospettati!</b> ✔️❌", {
                        parse_mode: "HTML"
                    })
                    if (usersId.includes(fullUser.id.toString())) {
                        conn.query(`UPDATE users SET verified = true WHERE id = "${fullUser.id}"`, (err) => {
                            if (err) return console.error(err)
                            api.sendMessage(CHATID, `<b>@${fullUser.username}</b> è stato verificato! ✔️`, {
                                parse_mode: "HTML"
                            })
                        })
                    } else {
                        registerUser(fullUser.id, fullUser.username)
                        conn.query(`UPDATE users SET verified = true WHERE id = "${fullUser.id}"`, (err) => {
                            if (err) return console.error(err)
                            api.sendMessage(CHATID, `<b>@${fullUser.username}</b> è stato verificato! ✔️`, {
                                parse_mode: "HTML"
                            })
                        })
                    }
                })
            })
        })
    })
}

const unverifica = msg => {
    api.getChatAdministrators(CHATID)
    .then(admins => {
        const adminsId = admins.map(admin => {
            return admin.user.id
        })
        api.getChatMember(CHATID, msg.from.id)
        .then(member => {
            if (!adminsId.includes(member.user.id)) return api.sendMessage(CHATID, "Solo gli admin possono eseguire questo comando!")
            let firstTaggedUser = msg.text.trim().replace(".unverifica", "").split(" ").find(word => word.startsWith("@"))?.replace("undefined", "")
            if (!firstTaggedUser || firstTaggedUser.length < 1 || !firstTaggedUser.startsWith("@")) {
                if (msg.reply_to_message?.from?.username !== undefined) firstTaggedUser = msg.reply_to_message.from.username
                else return api.sendMessage(CHATID, "Per favore, utilizza la sintassi corretta: .unverifica @username.\nEsempio: .unverifica <code>@Giuggetto</code>", {
                    parse_mode: "HTML"
                })
            }
            firstTaggedUser = firstTaggedUser.replace("@", "")
            getFullUser(firstTaggedUser)
            .then(fullUser => {
                if (!fullUser) return api.sendMessage(CHATID, `<b>Questo utente non esiste!</b> ✖`, {
                    parse_mode: "HTML"
                })
                conn.query("SELECT * FROM users", (err, dbUsers) => {
                    if (err) return console.error(err)
                    const usersId = dbUsers.map(dbUser => {
                        return dbUser.id
                    })
                    const dbUser = dbUsers.find(u => u.id === fullUser.id.toString())
                    if (!dbUser.verified) return api.sendMessage(CHATID, `<b>@${dbUser.username}</b> è già non verificato! ✖️`, {
                        parse_mode: "HTML"
                    })
                    if (usersId.includes(fullUser.id.toString())) {
                        conn.query(`UPDATE users SET verified = false WHERE id = "${fullUser.id}"`, (err) => {
                            if (err) return console.error(err)
                            api.sendMessage(CHATID, `<b>@${fullUser.username}</b> non è più verificato! ✔️❌`, {
                                parse_mode: "HTML"
                            })
                        })
                    } else api.sendMessage(CHATID, "<b>Questo utente non è registrato, di conseguenza non ha feedback!</b> ✖", {
                        parse_mode: "HTML"
                    })
                })
            })
        })
    })
}

const getVerifedUsersList = msg => {
    conn.query("SELECT * FROM users", (err, users) => {
        if (err) return console.error(err)
        const verifiedUsers = users.filter(user => user.verified)
        let verifiedUsersList = ""
        verifiedUsers.map(user => {
            verifiedUsersList += `• @${user.username} [<code>${user.id}</code>]\n`
        })
        if (verifiedUsers.length > 0) api.sendMessage(CHATID, `✔️ <b>Utenti verificati dalla community di @MoNoPolyScamBigITA:</b>\n${verifiedUsersList}`, {
            parse_mode: "HTML"
        })
        else api.sendMessage(CHATID, `Nessun utente in questo gruppo è <b>verificato al momento!</b> ✔️❌`, {
            parse_mode: "HTML"
        })
    })
}

// adds a feedback to a user in the db
const addFeedback = msg => {
    api.getChatAdministrators(CHATID)
    .then(admins => {
        const adminsId = admins.map(admin => {
            return admin.user.id
        })
        api.getChatMember(CHATID, msg.from.id)
        .then(member => {
            if (!adminsId.includes(member.user.id)) return api.sendMessage(CHATID, "Solo gli admin possono eseguire questo comando!")
            let firstTaggedUser = msg.text.trim().replace(".addfeedback", "").split(" ").find(word => word.startsWith("@"))?.replace("undefined", "")
            if (!firstTaggedUser || firstTaggedUser.length < 1 || !firstTaggedUser.startsWith("@")) {
                if (msg.reply_to_message?.from?.username !== undefined) firstTaggedUser = msg.reply_to_message.from.username
                else return api.sendMessage(CHATID, "Per favore, utilizza la sintassi corretta: .addfeedback @username numero_di_feedback.\nEsempio: .addfeedback <code>@Giuggetto</code> <code>1</code>", {
                    parse_mode: "HTML"
                })
            }
            let numberOfFeedbacks = parseInt(msg.text.replace(firstTaggedUser, "").match(/\d+/)?.join(""))
            if (!numberOfFeedbacks || typeof numberOfFeedbacks !== "number" || numberOfFeedbacks < 1) numberOfFeedbacks = 1
            firstTaggedUser = firstTaggedUser.replace("@", "")
            getFullUser(firstTaggedUser)
            .then(fullUser => {
                conn.query("SELECT * FROM users", (err, dbUsers) => {
                    if (err) return console.error(err)
                    const usersId = dbUsers.map(dbUser => {
                        return dbUser.id
                    })
                    if (usersId.includes(fullUser.id.toString())) {
                        const currentUsersFeedbacks = dbUsers.find(u => u.id === fullUser.id.toString()).feedbacks
                        conn.query(`UPDATE users SET feedbacks = ${currentUsersFeedbacks + numberOfFeedbacks} WHERE id = "${fullUser.id}"`, (err) => {
                            if (err) return console.error(err)
                            if (numberOfFeedbacks === 1) api.sendMessage(CHATID, `Aggiunto un feedback a <b>@${fullUser.username}</b> ✅`, {
                                parse_mode: "HTML"
                            })
                            else if (numberOfFeedbacks > 1) api.sendMessage(CHATID, `Aggiunti <b>${numberOfFeedbacks}</b> feedback a <b>@${fullUser.username}</b> ✅`,  {
                                parse_mode: "HTML"
                            })
                        })
                    } else {
                        registerUser(fullUser.id, fullUser.username)
                        conn.query(`UPDATE users SET feedbacks = ${numberOfFeedbacks} WHERE id = "${fullUser.id}"`, (err) => {
                            if (err) return console.error(err)
                            if (numberOfFeedbacks === 1) api.sendMessage(CHATID, `Aggiunto un feedback a <b>@${fullUser.username}</b> ✅`, {
                                parse_mode: "HTML"
                            })
                            else if (numberOfFeedbacks > 1) api.sendMessage(CHATID, `Aggiunti <b>${numberOfFeedbacks}</b> feedback a <b>@${fullUser.username}</b> ✅`,  {
                                parse_mode: "HTML"
                            })
                        })
                    }
                })
            })
        })
    })
}

const delFeedback = msg => {
    api.getChatAdministrators(CHATID)
    .then(admins => {
        const adminsId = admins.map(admin => {
            return admin.user.id
        })
        api.getChatMember(CHATID, msg.from.id)
        .then(member => {
            if (!adminsId.includes(member.user.id)) return api.sendMessage(CHATID, "Solo gli admin possono eseguire questo comando!")
            let firstTaggedUser = msg.text.trim().replace(".delfeedback", "").split(" ").find(word => word.startsWith("@"))?.replace("undefined", "")
            if (!firstTaggedUser || firstTaggedUser.length < 1 || !firstTaggedUser.startsWith("@")) {
                if (msg.reply_to_message?.from?.username !== undefined) firstTaggedUser = msg.reply_to_message.from.username
                else return api.sendMessage(CHATID, "Per favore, utilizza la sintassi corretta: .delfeedback @username numero_di_feedback.\nEsempio: .delfeedback <code>@Giuggetto</code> <code>1</code>", {
                    parse_mode: "HTML"
                })
            }
            let numberOfFeedbacks = parseInt(msg.text.replace(firstTaggedUser, "").match(/\d+/)?.join(""))
            if (!numberOfFeedbacks || typeof numberOfFeedbacks !== "number" || numberOfFeedbacks < 1) numberOfFeedbacks = 1
            firstTaggedUser = firstTaggedUser.replace("@", "")
            getFullUser(firstTaggedUser)
            .then(fullUser => {
                conn.query("SELECT * FROM users", (err, dbUsers) => {
                    if (err) return console.error(err)
                    const usersId = dbUsers.map(dbUser => {
                        return dbUser.id
                    })
                    if (usersId.includes(fullUser.id.toString())) {
                        const currentUsersFeedbacks = dbUsers.find(u => u.id === fullUser.id.toString()).feedbacks
                        if (currentUsersFeedbacks < numberOfFeedbacks) return api.sendMessage(CHATID, `Non puoi rimuovere ${numberOfFeedbacks} feedback a questo utente perchè ne ha solo ${currentUsersFeedbacks}!`)
                        conn.query(`UPDATE users SET feedbacks = ${currentUsersFeedbacks - numberOfFeedbacks} WHERE id = "${fullUser.id}"`, (err) => {
                            if (err) return console.error(err)
                            if (numberOfFeedbacks === 1) api.sendMessage(CHATID, `Rimosso un feedback a <b>@${fullUser.username}</b>! ✅❌`, {
                                parse_mode: "HTML"
                            })
                            else if (numberOfFeedbacks > 1) api.sendMessage(CHATID, `Rimossi <b>${numberOfFeedbacks}</b> feedback a <b>@${fullUser.username}</b>! ✅❌`, {
                                parse_mode: "HTML"
                            })
                        })
                    } else {
                        api.sendMessage(CHATID, "<b>Questo utente non è registrato, di conseguenza non ha feedback!</b> ✖", {
                            parse_mode: "HTML"
                        })
                    }
                })
            })
        })
    })
}

// get user info
const inf = msg => {
    let firstTaggedUser = msg.text.trim().replace(".inf", "").split(" ").find(word => word.startsWith("@"))?.replace("undefined", "")
    if (!firstTaggedUser || firstTaggedUser.length < 1 || !firstTaggedUser.startsWith("@")) {
        if (msg.reply_to_message?.from?.username !== undefined) firstTaggedUser = msg.reply_to_message.from.username
        else firstTaggedUser = msg.from.username
    }
    firstTaggedUser = firstTaggedUser.replace("@", "")
    conn.query("SELECT * FROM users", (err, dbUsers) => {
        if (err) return console.error(err)
        if (!dbUsers || dbUsers < 1) return api.sendMessage(CHATID, "<b>Questo utente non è registrato, di conseguenza non ha feedback!</b> ✖", {
            parse_mode: "HTML"
        })
        const user = dbUsers.find(u => u.username.toLowerCase() === firstTaggedUser.toLowerCase())
        if (!user) return api.sendMessage(CHATID, "<b>Questo utente non è registrato, di conseguenza non ha feedback!</b> ✖", {
            parse_mode: "HTML"
        })
        if (user.sus) api.sendMessage(CHATID, `<b>🔍 Informazioni sull'utente:\n\n🪪 Username: @${user.username}\n🆔 ID: <code>${user.id}</code>\n✅ Feedback: ${user.feedbacks}\n\n‼️ Sospetto (possibile truffatore): Sì</b>`, {
            parse_mode: "HTML"
        })
        else api.sendMessage(CHATID, `<b>🔍 Informazioni sull'utente:\n\n🪪 Username: @${user.username}\n🆔 ID: <code>${user.id}</code>\n✅ Feedback: ${user.feedbacks}\n\n✔️ Verificato da @MoNoPolyScamBigITA: ${user.verified ? "Sì" : "No"}</b>`, {
            parse_mode: "HTML"
        })
    })
}

const help = msg => {
    api.sendMessage(CHATID, `<b>LISTA DEI COMANDI DEL FEEDBACK BOT🤖</b>\n\n• <b>.verifica</b>: usalo per verificare un utente. Sintassi: .verifica @username (Esclusivo per gli <b>admin</b>)\n• <b>.addfeedback</b>: usalo per aggiungere feedback a un utente. Sintassi: .addfeedback @username numero_feedback. (Esclusivo per gli <b>admin</b>)\n• <b>.delfeedback</b>: usalo per rimuovere dei feedback a un utente. Sintassi: .delfeedback @username numero_feedback (Esclusivo per gli <b>admin</b>)\n• <b>@feedback</b>: usalo per richiedere agli admin di aggiungere un feedback a un utente dopo uno scambio e allega una prova di quest'ultimo. Sintassi: @feedback @username messaggio\n• <b>.verificati</b>: usalo per vedere la lista di utenti verificati nel gruppo.\n• <b>.inf</b>: usalo per vedere le informazioni di un utente. Sintassi: .inf @username\n• <b>.sospetta</b>: usalo per aggiungere un utente alla lista dei sospettati. (Esclusivo per gli <b>admin</b>)\n• <b>.unsospetta</b>: usalo per rimuovere un utente dalla lista dei sospettati. (Esclusivo per gli <b>admin</b>)\n• <b>.sospettati</b>: usalo per vedere la lista completa dei sospettati`, {
        parse_mode: "HTML"
    })
}

const sospetta = msg => {
    api.getChatAdministrators(CHATID)
    .then(admins => {
        const adminsId = admins.map(admin => {
            return admin.user.id
        })
        api.getChatMember(CHATID, msg.from.id)
        .then(member => {
            if (!adminsId.includes(member.user.id)) return api.sendMessage(CHATID, "Solo gli admin possono eseguire questo comando!")
            let firstTaggedUser = msg.text.trim().replace(".sospetta", "").split(" ").find(word => word.startsWith("@"))?.replace("undefined", "")
            if (!firstTaggedUser || firstTaggedUser.length < 1 || !firstTaggedUser.startsWith("@")) {
                if (msg.reply_to_message?.from?.username !== undefined) firstTaggedUser = msg.reply_to_message.from.username
                else return api.sendMessage(CHATID, "Per favore, utilizza la sintassi corretta: .sospetta @username.\nEsempio: .sospetta <code>@Giuggetto</code>", {
                    parse_mode: "HTML"
                })
            }
            firstTaggedUser = firstTaggedUser.replace("@", "")
            getFullUser(firstTaggedUser)
            .then(fullUser => {
                if (!fullUser) return api.sendMessage(CHATID, `<b>Questo utente non esiste!</b> ✖`, {
                    parse_mode: "HTML"
                })
                conn.query("SELECT * FROM users", (err, dbUsers) => {
                    if (err) return console.error(err)
                    const usersId = dbUsers.map(dbUser => {
                        return dbUser.id
                    })
                    const dbUser = dbUsers.find(u => u.id === fullUser.id.toString())
                    if (dbUser.sus) return api.sendMessage(CHATID, `<b>@${dbUser.username}</b> è già tra i sospettati! ‼️`, {
                        parse_mode: "HTML"
                    })
                    if (dbUser.verified) return api.sendMessage(CHATID, "Questo utente non può essere sospettato perchè fa parte della lista dei <b>verificati</b>! ✔️", {
                        parse_mode: "HTML"
                    })
                    if (usersId.includes(fullUser.id.toString())) {
                        conn.query(`UPDATE users SET sus = true WHERE id = "${fullUser.id}"`, (err) => {
                            if (err) return console.error(err)
                            api.sendMessage(CHATID, `<b>@${fullUser.username}</b> è diventato un sospettato! ‼️`, {
                                parse_mode: "HTML"
                            })
                        })
                    } else {
                        registerUser(fullUser.id, fullUser.username)
                        conn.query(`UPDATE users SET sus = true WHERE id = "${fullUser.id}"`, (err) => {
                            if (err) return console.error(err)
                            api.sendMessage(CHATID, `<b>@${fullUser.username}</b> è diventato un sospettato! ‼️`, {
                                parse_mode: "HTML"
                            })
                        })
                    }
                })
            })
        })
    })
}

const unsospetta = msg => {
    api.getChatAdministrators(CHATID)
    .then(admins => {
        const adminsId = admins.map(admin => {
            return admin.user.id
        })
        api.getChatMember(CHATID, msg.from.id)
        .then(member => {
            if (!adminsId.includes(member.user.id)) return api.sendMessage(CHATID, "Solo gli admin possono eseguire questo comando!")
            let firstTaggedUser = msg.text.trim().replace(".unsospetta", "").split(" ").find(word => word.startsWith("@"))?.replace("undefined", "")
            if (!firstTaggedUser || firstTaggedUser.length < 1 || !firstTaggedUser.startsWith("@")) {
                if (msg.reply_to_message?.from?.username !== undefined) firstTaggedUser = msg.reply_to_message.from.username
                else return api.sendMessage(CHATID, "Per favore, utilizza la sintassi corretta: .unsospetta @username.\nEsempio: .unsospetta <code>@Giuggetto</code>", {
                    parse_mode: "HTML"
                })
            }
            firstTaggedUser = firstTaggedUser.replace("@", "")
            getFullUser(firstTaggedUser)
            .then(fullUser => {
                if (!fullUser) return api.sendMessage(CHATID, `<b>Questo utente non esiste!</b> ✖`, {
                    parse_mode: "HTML"
                })
                conn.query("SELECT * FROM users", (err, dbUsers) => {
                    if (err) return console.error(err)
                    const usersId = dbUsers.map(dbUser => {
                        return dbUser.id
                    })
                    const dbUser = dbUsers.find(u => u.id === fullUser.id.toString())
                    if (!dbUser.sus) return api.sendMessage(CHATID, `<b>@${dbUser.username}</b> è già tra i non sospettati! ‼️❌`, {
                        parse_mode: "HTML"
                    })
                    if (usersId.includes(fullUser.id.toString())) {
                        conn.query(`UPDATE users SET sus = false WHERE id = "${fullUser.id}"`, (err) => {
                            if (err) return console.error(err)
                            api.sendMessage(CHATID, `<b>@${fullUser.username}</b> non è più tra i sospettati! ‼️❌`, {
                                parse_mode: "HTML"
                            })
                        })
                    } else api.sendMessage(CHATID, "<b>Questo utente non è registrato, di conseguenza non ha feedback!</b> ✖", {
                        parse_mode: "HTML"
                    })
                })
            })
        })
    })
}

const getSusList = msg => {
    conn.query("SELECT * FROM users", (err, users) => {
        if (err) return console.error(err)
        const verifiedUsers = users.filter(user => user.sus)
        let verifiedUsersList = ""
        verifiedUsers.map(user => {
            verifiedUsersList += `• @${user.username} [<code>${user.id}</code>]\n`
        })
        if (verifiedUsers.length > 0) api.sendMessage(CHATID, `<b>‼️ Utenti sospettati dalla community di @MoNoPolyScamBigITA:</b>\n${verifiedUsersList}`, {
            parse_mode: "HTML"
        })
        else api.sendMessage(CHATID, "Nessun utente in questo gruppo è <b>sospettato al momento!</b> ‼️❌", {
            parse_mode: "HTML"
        })
    })
}

// command list
api.on("message", msg => {
    if (msg.chat.id.toString() !== CHATID) return console.log("different chat id")
    if (msg.text.startsWith(".com")) help(msg)
    if (msg.text.startsWith("@feedback")) requestFeedback(msg)
    if (msg.text.startsWith(".sospettati")) return getSusList(msg)
    if (msg.text.startsWith(".sospetta")) sospetta(msg)
    if (msg.text.startsWith(".unsospetta")) unsospetta(msg)
    if (msg.text.startsWith(".addfeedback")) addFeedback(msg)
    if (msg.text.startsWith(".delfeedback")) delFeedback(msg)
    if (msg.text.startsWith(".inf")) inf(msg)
    if (msg.text.startsWith(".unverifica")) unverifica(msg)
    if (msg.text.startsWith(".verificati")) getVerifedUsersList(msg)
    else if (msg.text.startsWith(".verifica")) verifica(msg)
})

// button listener
api.on("callback_query", (callbackQuery) => {
    const action = callbackQuery.data
    const msg = callbackQuery.message
    const opts = {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      parse_mode: "HTML"
    }
    let text

    if (action.includes("resolved")) {
        text = `${msg.text}\n\n~ ✅ @${callbackQuery.from.username} [<code>${callbackQuery.from.id}</code>]`
        return api.editMessageText(text, opts)
    }

    const currentUser = currentUsersMessages[msg.message_id - 1]
    const currentMessage = feedbackRequests.find(m => m.message_id === msg.message_id - 1)
    
    if (action.includes(`btn_yes`) && currentUser.id.toString() === callbackQuery.from.id.toString()) text = "✅ <b>Messaggio inviato agli admin!</b>"
    if (action.includes(`btn_no`) && currentUser.id.toString() === callbackQuery.from.id.toString()) text = "✖ <b>Invio del messaggio annullato!</b>"
  
    if (text) {
        getFullUser(currentMessage.text.trim().replace("@feedback", "").replaceAll(" ", "").replace("undefined", "").replace("@", ""))
        .then(taggedUser => {
            api.editMessageText(text, opts)
            if (action.includes("btn_yes")) api.sendMessage(ADMINCHATID, `
                ✅RICHIESTA FEEDBACK: \n• <b>Di</b>: @${callbackQuery.from.username} [<code>${callbackQuery.from.id}</code>] \n• <b>A</b>: @${taggedUser.username} [<code>${taggedUser.id}</code>] \n• <b>Gruppo</b>: ScamBi MonoPoly GO ᧁITA 🌼 [<code>${CHATID}</code>]`, {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "👀 Vai al messaggio",
                                url: `https://t.me/${msg.chat.username}/${currentMessage.message_id}`
                            },
                            {
                                text: "✅ Risolto",
                                callback_data: `resolved_${msg.message_id}`
                            }
                        ]
                    ]
                }
            })
        })
    }
    else api.answerCallbackQuery(callbackQuery.id, {
        text: "Non puoi cliccare su questo pulsante",
        show_alert: true
    })
})