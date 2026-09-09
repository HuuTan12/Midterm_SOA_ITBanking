/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

DROP TABLE IF EXISTS `Students`;
DROP TABLE IF EXISTS `TuitionFees`;
CREATE TABLE `Students` (
  `mssv` varchar(255) NOT NULL,
  `full_name` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`mssv`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `TuitionFees` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mssv` varchar(20) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `status` varchar(20) DEFAULT 'PENDING',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `version` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `mssv` (`mssv`),
  CONSTRAINT `TuitionFees_ibfk_1` FOREIGN KEY (`mssv`) REFERENCES `Students` (`mssv`)
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `Students` (`mssv`, `full_name`, `email`) VALUES
('504073', 'Pham Gia Bao', 'bao@student.tdtu.edu.vn'),
('504074', 'Vo Minh Khang', 'khang@student.tdtu.edu.vn'),
('504075', 'Nguyen Thanh Dat', 'dat@student.tdtu.edu.vn'),
('504076', 'Tran Hoang Nam', 'nam@student.tdtu.edu.vn'),
('504077', 'Le Minh Quan', 'quan@student.tdtu.edu.vn'),
('504078', 'Pham Tuan Anh', 'tuananh@student.tdtu.edu.vn'),
('504079', 'Do Quang Huy', 'huy@student.tdtu.edu.vn'),
('524H0028', 'Nguyen Huu Tan', 'tan@student.tdtu.edu.vn'),
('524H0029', 'Tran Minh Thai', 'thai@student.tdtu.edu.vn'),
('524H0030', 'Le Quoc Viet', 'viet@student.tdtu.edu.vn');
INSERT INTO `TuitionFees` (`id`, `mssv`, `amount`, `status`, `created_at`, `version`) VALUES
(7, '524H0028', '15000000.00', 'PAID', '2026-09-05 05:40:32', 2),
(8, '524H0029', '12500000.00', 'PAID', '2026-09-05 05:40:32', 2),
(9, '524H0030', '12500000.00', 'PAID', '2026-09-05 05:40:32', 2),
(10, '504073', '15000000.00', 'PENDING', '2026-09-09 05:12:02', 1),
(11, '504074', '13500000.00', 'PAID', '2026-09-09 05:12:02', 2),
(12, '504075', '12000000.00', 'PENDING', '2026-09-09 05:12:02', 1),
(13, '504076', '14500000.00', 'PAID', '2026-09-09 05:12:02', 2),
(14, '504077', '13000000.00', 'PAID', '2026-09-09 05:12:02', 2);


/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;